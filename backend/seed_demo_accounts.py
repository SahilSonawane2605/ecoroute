"""
Safe Development-Only Demo Account Provisioning Script.
Strictly disabled in production (checks ECOROUTE_ENV != 'production').

Creates or updates the two required demo credentials:
1. Citizen Demo: citizen.demo@ecoroute.local
2. Municipal Demo: municipal.demo@ecoroute.local

Usage:
    python -m backend.seed_demo_accounts
    python -m backend.seed_demo_accounts --password "CustomStrongPassword#2026"
"""

import os
import sys
import uuid
import secrets
import argparse
from datetime import datetime, timezone

from backend.database import get_db_connection, init_db
from backend.services.auth_service import hash_password

DEFAULT_DEMO_PASSWORD_ENV = os.environ.get("ECOROUTE_DEMO_PASSWORD", "PuneEco#Demo2026")

def provision_demo_accounts(password: str = None):
    # Production guard
    env = os.environ.get("ECOROUTE_ENV", "development").lower()
    if env == "production":
        print("ERROR: Demo account provisioning is strictly disabled in production (ECOROUTE_ENV=production).")
        sys.exit(1)

    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    demo_pwd = password or DEFAULT_DEMO_PASSWORD_ENV
    hashed = hash_password(demo_pwd)
    now = datetime.now(timezone.utc).isoformat()

    accounts = [
        {
            "id": "DEMO-CITIZEN-01",
            "email": "citizen.demo@ecoroute.local",
            "full_name": "Demo Citizen User",
            "role": "citizen",
            "ward": "Ward 9 - Kothrud"
        },
        {
            "id": "DEMO-ADMIN-01",
            "email": "municipal.demo@ecoroute.local",
            "full_name": "Demo Municipal Officer",
            "role": "municipal_admin",
            "ward": "PMC Central Drainage Cell"
        }
    ]

    for acc in accounts:
        cursor.execute("SELECT id, role FROM users WHERE email = ?", (acc["email"],))
        existing = cursor.fetchone()
        if existing:
            # Update password and ensure active status
            cursor.execute("""
                UPDATE users 
                SET hashed_password = ?, full_name = ?, role = ?, ward = ?, is_active = 1
                WHERE email = ?
            """, (hashed, acc["full_name"], acc["role"], acc["ward"], acc["email"]))
            print(f"Updated existing demo account: {acc['email']} (role: {acc['role']})")
        else:
            cursor.execute("""
                INSERT INTO users (id, email, hashed_password, full_name, role, ward, created_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """, (acc["id"], acc["email"], hashed, acc["full_name"], acc["role"], acc["ward"], now))
            print(f"Created new demo account: {acc['email']} (role: {acc['role']})")

    conn.commit()
    conn.close()

    print("\n--- DEMO CREDENTIALS SUMMARY ---")
    print(f"Citizen Demo:   citizen.demo@ecoroute.local")
    print(f"Municipal Demo: municipal.demo@ecoroute.local")
    print(f"Password:       {demo_pwd}")
    print("--------------------------------\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo accounts for local development")
    parser.add_argument("--password", help="Optional custom demo password", default=None)
    args = parser.parse_args()
    provision_demo_accounts(password=args.password)
