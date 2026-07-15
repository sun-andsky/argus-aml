"""
Neo4j Live Graph Service
==========================
Connects to Neo4j AuraDB for live transaction graph context — separate
from the static scoring snapshot (ScoringService), since this reflects
whatever is in the database RIGHT NOW, not a frozen export.
"""

import os
from neo4j import GraphDatabase
from dotenv import load_dotenv


load_dotenv()


class Neo4jService:
    """
    Holds one Neo4j driver connection, reused across requests. Instantiated
    once at app startup, same pattern as ScoringService.
    """

    def __init__(self):
        uri = os.getenv("NEO4J_URI").strip()
        username = os.getenv("NEO4J_USERNAME").strip()
        password = os.getenv("NEO4J_PASSWORD").strip()

        if not all([uri, username, password]):
            raise RuntimeError(
                "Missing Neo4j credentials. Check that .env exists in the "
                "project root and contains NEO4J_URI, NEO4J_USERNAME, "
                "NEO4J_PASSWORD."
            )

        print("[Neo4jService] Connecting to Neo4j AuraDB...")
        self.driver = GraphDatabase.driver(uri, auth=(username, password))
        self.driver.verify_connectivity()
        print("[Neo4jService] Connected.")

    def close(self):
        self.driver.close()

    def get_account_neighbors(self, account_id: str, hop_limit: int = 1) -> dict:
        """
        Pull an account's immediate transaction neighbors live from Neo4j —
        both incoming and outgoing — along with the connecting transaction
        details. hop_limit is currently fixed at 1 (direct neighbors only);
        multi-hop tracing is Week 7 scope, not this endpoint.
        """
        query = """
        MATCH (a:Account {account_id: $account_id})

        OPTIONAL MATCH (a)-[t_out:TRANSACTION]->(receiver:Account)
        WITH a, collect({
            direction   : 'out',
            counterparty: receiver.account_id,
            amount      : t_out.amount_paid,
            timestamp   : t_out.timestamp,
            is_laundering: t_out.is_laundering
        }) AS outgoing

        OPTIONAL MATCH (sender:Account)-[t_in:TRANSACTION]->(a)
        WITH a, outgoing, collect({
            direction   : 'in',
            counterparty: sender.account_id,
            amount      : t_in.amount_paid,
            timestamp   : t_in.timestamp,
            is_laundering: t_in.is_laundering
        }) AS incoming

        RETURN
            a.account_id AS account_id,
            outgoing,
            incoming
        """

        with self.driver.session() as session:
            result = session.run(query, account_id=account_id)
            record = result.single()

        if record is None:
            raise KeyError(f"Account {account_id} not found in Neo4j graph")

        # Drop placeholder nulls from OPTIONAL MATCH producing an empty entry
        outgoing = [tx for tx in record["outgoing"] if tx.get("amount") is not None]
        incoming = [tx for tx in record["incoming"] if tx.get("amount") is not None]

        return {
            "account_id": record["account_id"],
            "outgoing_count": len(outgoing),
            "incoming_count": len(incoming),
            "outgoing": outgoing,
            "incoming": incoming,
        }
    
    def trace_fund_flow(self, account_id: str, hops: int = 3, direction: str = "out") -> dict:
        """
        Multi-hop fund flow trace from a starting account. Uses a bounded
        variable-length Cypher pattern (not the fixed-hop-by-hop style used
        in the Cycle Detection module) because this endpoint traces an
        open-ended TREE of fund movement, not closed cycles — a fixed
        per-hop query would need a separate hardcoded query per depth,
        which doesn't make sense for a caller-configurable parameter.

        direction: 'out' traces where money WENT (outgoing chains),
                   'in' traces where money CAME FROM (incoming chains).

        A hard LIMIT protects against combinatorial blowup on high-degree
        hub accounts — see the hop-depth design note in Week 7 planning.
        """
        if hops < 1 or hops > 5:
            raise ValueError("hops must be between 1 and 5")

        if direction not in ("out", "in"):
            raise ValueError("direction must be 'out' or 'in'")

        # Cypher variable-length patterns require the hop count to be
        # interpolated into the pattern string itself (parameters can't
        # be used inside *1..N syntax) — safe here because `hops` is
        # validated as an int above, not raw user string input.
        if direction == "out":
            pattern = f"(start:Account {{account_id: $account_id}})-[t:TRANSACTION*1..{hops}]->(reached:Account)"
        else:
            pattern = f"(reached:Account)-[t:TRANSACTION*1..{hops}]->(start:Account {{account_id: $account_id}})"

        query = f"""
        MATCH path = {pattern}
        WITH path, reached, relationships(path) AS txns
        RETURN
            reached.account_id AS reached_account,
            length(path)        AS hop_count,
            [tx IN txns | tx.amount_paid]    AS amounts,
            [tx IN txns | tx.timestamp]      AS timestamps,
            [tx IN txns | tx.is_laundering]  AS is_laundering,
            [n IN nodes(path) | n.account_id] AS path_accounts
        ORDER BY hop_count ASC
        LIMIT 500
        """

        with self.driver.session() as session:
            result = session.run(query, account_id=account_id)
            records = result.data()

        if not records:
            # Distinguish "account exists but has no chains" from
            # "account doesn't exist" with a quick existence check
            check_query = "MATCH (a:Account {account_id: $account_id}) RETURN a.account_id AS id"
            with self.driver.session() as session:
                exists = session.run(check_query, account_id=account_id).single()
            if exists is None:
                raise KeyError(f"Account {account_id} not found in Neo4j graph")

        return {
            "start_account": account_id,
            "direction": direction,
            "hops_requested": hops,
            "paths_found": len(records),
            "paths": records,
        }
    

    def create_transaction(self, sender_id: str, receiver_id: str, amount: float,
                            timestamp: str, payment_format: str = None,
                            is_laundering: bool = False) -> dict:
        """
        Writes a new transaction into the live graph — the actual real-time
        ingestion point. Uses MERGE for both accounts so brand-new accounts
        are created on first appearance, and CREATE for the relationship
        since each transaction is a distinct event, not something to dedupe.
        """
        query = """
        MERGE (sender:Account {account_id: $sender_id})
        MERGE (receiver:Account {account_id: $receiver_id})
        CREATE (sender)-[t:TRANSACTION {
            amount_paid: $amount,
            timestamp: $timestamp,
            payment_format: $payment_format,
            is_laundering: $is_laundering
        }]->(receiver)
        RETURN sender.account_id AS sender_id, receiver.account_id AS receiver_id
        """

        with self.driver.session() as session:
            result = session.run(
                query,
                sender_id=sender_id,
                receiver_id=receiver_id,
                amount=amount,
                timestamp=timestamp,
                payment_format=payment_format,
                is_laundering=is_laundering,
            )
            record = result.single()

        return {"sender_id": record["sender_id"], "receiver_id": record["receiver_id"]}