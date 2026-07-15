"""
Model class definitions.

IMPORTANT: This GraphSAGE class must match the architecture used during
training EXACTLY (same layer types, same hidden_channels) — PyTorch loads
weights into a class structure that must already exist, it does not
reconstruct the architecture from the saved file.
"""

import torch
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv


class GraphSAGE(torch.nn.Module):
    def __init__(self, in_channels: int, hidden_channels: int, out_channels: int):
        super().__init__()
        self.conv1 = SAGEConv(in_channels, hidden_channels)
        self.conv2 = SAGEConv(hidden_channels, out_channels)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        x = self.conv2(x, edge_index)
        return x


def load_graphsage_model(weights_path: str, in_channels: int,
                          hidden_channels: int = 64, out_channels: int = 2,
                          device: str = "cpu") -> GraphSAGE:
    """
    Instantiate a fresh GraphSAGE with the same architecture used in training,
    then load the saved weights into it. hidden_channels=64 matches the
    training notebook's Module 7 configuration — change only if you trained
    with a different value.
    """
    model = GraphSAGE(in_channels, hidden_channels, out_channels)
    state_dict = torch.load(weights_path, map_location=device)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    return model