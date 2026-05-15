"""
MLOps Incident Commander — Agent Entry Point
Add to langgraph.json: "incident": "./main_incident.py:graph"
"""

from src.incident_graph import graph

__all__ = ["graph"]
