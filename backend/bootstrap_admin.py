"""
Safe CLI script to bootstrap the initial municipal administrator without exposing credentials.
Usage:
    python -m backend.bootstrap_admin --email admin@pune.gov.in --name "Chief Drainage Engineer" --ward "PMC Central"
Prompts for password securely without echoing to terminal.
"""

import sys
import uuid
import getpass
import argparse
from datetime import datetime, timezone

from backend.database import get_db_connection, init_db
from backend.services.auth_service import hash_password

def bootstrap_admin(email: str, full_name: str, ward: str, password: str = None):
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, email, role FROM users WHERE email = ?", (email.strip().lower(),))
    existing = cursor.fetchone()
    if existing:
        print(f"User with email '{email}' already exists with role '{existing['role']}'.")
        conn.close()
        return

    if not password:
        password = getpass.getpass("Enter secure password for municipal administrator: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Error: Passwords do not match.")
            conn.close()
            sys.exit(1)

    if len(password) < 8:
        print("Error: Password must be at least 8 characters.")
        conn.close()
        sys.exit(1)

    hashed = hash_password(password)
    user_id = f"ADM-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
        INSERT INTO users (id, email, hashed_password, full_name, role, ward, created_at, is_active)
        VALUES (?, ?, ?, ?, 'municipal_admin', ?, ?, 1)
    """, (user_id, email.strip().lower(), hashed, full_name.strip(), ward.strip(), now))

    conn.commit()
    conn.close()

    print(f"Successfully bootstrapped municipal administrator:")
    print(f"  ID: {user_id}")
    print(f"  Email: {email.strip().lower()}")
    print(f"  Name: {full_name.strip()}")
    print(f"  Role: municipal_admin")
    print(f"  Ward: {ward.strip()}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap Municipal Administrator")
    parser.add_argument("--email", default="admin@pmc.gov.in", help="Admin email address")
    parser.add_argument("--name", default="Superintendent Engineer D. Pawar", help="Admin full name")
    parser.add_argument("--ward", default="Pune Municipal Corporation Head Office", help="Admin ward/jurisdiction")
    parser.add_argument("--password", default=None, help="Optional inline password for non-interactive automation")
    args = parser.parse_args()

    bootstrap_admin(args.email, args.name, args.ward, args.password)
