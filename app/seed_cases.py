import pandas as pd
import requests

API_BASE = "http://127.0.0.1:8000"
CSV_PATH = "models\ensemble_account_scores.csv"  # adjust path
TOP_N = 15  # how many top-risk accounts to seed as cases

df = pd.read_csv(CSV_PATH)
df_sorted = df.sort_values("ensemble_prob", ascending=False)
top_accounts = df_sorted.head(TOP_N)

created = 0
for _, row in top_accounts.iterrows():
    resp = requests.post(f"{API_BASE}/cases", json={
        "account_id": row["account_id"],
    })
    if resp.status_code == 200:
        created += 1
        print(f"✓ Case created for {row['account_id']} (score: {row['ensemble_prob']:.3f})")
    else:
        print(f"✗ Failed for {row['account_id']}: {resp.status_code} {resp.text}")

print(f"\n{created}/{TOP_N} cases created.")