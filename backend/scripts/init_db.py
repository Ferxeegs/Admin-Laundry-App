"""
Initialize database with initial data.
Run this script after migrations to seed the database.
"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.db.base_class import Base
from app.models.auth import Role, Permission, User
from app.models.common import Setting
from app.core.security import get_password_hash
from app.core.config import settings

# Import all models to ensure they are registered with Base.metadata
from app.models import *  # noqa: F401, F403


def init_roles(db: Session):
    """Initialize roles."""
    print("Sedang melakukan seeding roles...")
    
    roles = [
        {"name": "superadmin", "guard_name": "web"},
        {"name": "admin", "guard_name": "web"},
        {"name": "staff", "guard_name": "web"},
        {"name": "auditor", "guard_name": "web"},
    ]
    
    for role_data in roles:
        existing_role = db.query(Role).filter(Role.name == role_data["name"]).first()
        if not existing_role:
            role = Role(**role_data)
            db.add(role)
            db.flush()
            print(f'✓ Role "{role_data["name"]}" berhasil dibuat')
        else:
            print(f'✓ Role "{role_data["name"]}" sudah ada, dilewati')
    
    db.commit()


def init_permissions(db: Session):
    """Initialize permissions."""
    print("Sedang melakukan seeding permissions...")
    
    # Permissions untuk User model
    user_permissions = [
        "view_user",
        "create_user",
        "update_user",
        "delete_user",
        "restore_user",
        "force_delete_user",
    ]
    
    # Permissions untuk Role model
    role_permissions = [
        "view_role",
        "create_role",
        "update_role",
        "delete_role",
    ]
    
    # Permissions untuk Setting model
    setting_permissions = [
        "view_setting",
        "create_setting",
        "update_setting",
        "delete_setting",
    ]

    # Permissions untuk Student model
    student_permissions = [
        "view_student",
        "create_student",
        "update_student",
        "delete_student",
        "restore_student",
        "force_delete_student",
    ]

    # Permissions untuk Order model
    order_permissions = [
        "view_order",
        "create_order",
        "update_order",
        "delete_order",
        "restore_order",
        "force_delete_order",
    ]

    # Permissions untuk Report model
    report_permissions = [
        "view_report",
    ]

    # Permissions untuk QR Code model
    qr_code_permissions = [
        "view_qr_code",
        "create_qr_code",
        "update_qr_code",
        "delete_qr_code",
        "restore_qr_code",
        "force_delete_qr_code",
    ]

    # Permission untuk Dormitory model
    dormitory_permissions = [
        "view_dormitory",
        "create_dormitory",
        "update_dormitory",
        "delete_dormitory",
        "restore_dormitory",
        "force_delete_dormitory",
    ]

    # Permission untuk Invoice model
    invoice_permissions = [
        "view_invoice",
        "create_invoice",
        "update_invoice",
        "delete_invoice",
        "restore_invoice",
        "force_delete_invoice",
    ]

    # Permission untuk Myprofile
    myprofile_permissions = [
        "view_myprofile",
        "update_myprofile",
    ]

    # Permission untuk Add-on
    addon_permissions = [
        "view_addon",
        "create_addon",
        "update_addon",
        "delete_addon",
        "restore_addon",
        "force_delete_addon",
    ]
    # Combine all permissions
    all_permissions = user_permissions + role_permissions + setting_permissions + student_permissions + order_permissions + report_permissions + qr_code_permissions + dormitory_permissions + invoice_permissions + myprofile_permissions + addon_permissions
    
    for perm_name in all_permissions:
        existing_perm = db.query(Permission).filter(Permission.name == perm_name).first()
        if not existing_perm:
            perm = Permission(name=perm_name, guard_name="web")
            db.add(perm)
            db.flush()
            print(f'✓ Permission "{perm_name}" berhasil dibuat')
        else:
            print(f'✓ Permission "{perm_name}" sudah ada, dilewati')
    
    db.commit()
    
    # Assign all permissions to superadmin role
    superadmin_role = db.query(Role).filter(Role.name == "superadmin").first()
    if superadmin_role:
        all_perms_list = db.query(Permission).filter(Permission.guard_name == "web").all()
        
        if all_perms_list:
            # Refresh untuk memastikan relationships ter-load
            db.refresh(superadmin_role, ["permissions"])
            
            # Get existing permissions for superadmin
            existing_permission_ids = [perm.id for perm in superadmin_role.permissions]
            
            # Filter permissions that are not yet assigned
            permissions_to_assign = [
                perm for perm in all_perms_list 
                if perm.id not in existing_permission_ids
            ]
            
            if permissions_to_assign:
                # Assign all permissions to superadmin role
                superadmin_role.permissions.extend(permissions_to_assign)
                db.commit()
                db.refresh(superadmin_role, ["permissions"])
                print(f"✓ {len(permissions_to_assign)} permissions berhasil di-assign ke role superadmin")
            else:
                print("✓ Semua permissions sudah di-assign ke role superadmin")
            
            # Verifikasi final count
            db.refresh(superadmin_role, ["permissions"])
            final_count = len(superadmin_role.permissions) if superadmin_role.permissions else 0
            print(f"✓ Role superadmin sekarang memiliki {final_count} permissions")
        else:
            print("⚠️  Warning: Tidak ada permissions yang ditemukan")
    else:
        print("⚠️  Warning: Role superadmin tidak ditemukan")


def init_superadmin_user(db: Session):
    """Initialize superadmin user from environment variables."""
    print("Sedang melakukan seeding superadmin user...")
    
    # Get superadmin credentials from environment variables
    admin_username = os.getenv("INIT_ADMIN_USERNAME", "superadmin")
    admin_email = os.getenv("INIT_ADMIN_EMAIL", "admin@laundrypondok.com")
    admin_password = os.getenv("INIT_ADMIN_PASSWORD", "12341234")
    admin_firstname = os.getenv("INIT_ADMIN_FIRSTNAME", "Super")
    admin_lastname = os.getenv("INIT_ADMIN_LASTNAME", "Admin")
    
    # Validasi password: pastikan adalah plain text, bukan hash
    if not admin_password:
        raise ValueError("INIT_ADMIN_PASSWORD tidak boleh kosong")
    
    # Cek apakah password sudah berupa hash (jangan hash lagi jika sudah hash)
    if admin_password.startswith("$2") and len(admin_password) >= 59:
        print("⚠️  Warning: Password dari environment variable terdeteksi sebagai hash.")
        print("   Menggunakan password tersebut langsung tanpa hashing ulang.")
        hashed_password = admin_password
    else:
        # Password adalah plain text, hash sekarang
        try:
            hashed_password = get_password_hash(admin_password)
        except ValueError as e:
            print(f"✗ Error saat hashing password: {e}")
            raise
    
    # Check if superadmin user already exists
    existing_superadmin = db.query(User).filter(
        (User.email == admin_email) | (User.username == admin_username)
    ).first()
    
    if not existing_superadmin:
        # Create superadmin user
        superadmin = User(
            username=admin_username,
            email=admin_email,
            firstname=admin_firstname,
            lastname=admin_lastname,
            fullname=f"{admin_firstname} {admin_lastname}",
            password=hashed_password
        )
        db.add(superadmin)
        db.flush()
        
        # Assign superadmin role
        superadmin_role = db.query(Role).filter(Role.name == "superadmin").first()
        if superadmin_role:
            superadmin.roles.append(superadmin_role)
            db.commit()
            
            # Refresh untuk memastikan relationships ter-load
            db.refresh(superadmin, ["roles"])
            db.refresh(superadmin_role, ["permissions"])
            
            # Verifikasi permissions
            permission_count = len(superadmin_role.permissions) if superadmin_role.permissions else 0
            print("✓ Superadmin user berhasil dibuat dengan role superadmin")
            print(f"  Email: {admin_email}")
            print(f"  Username: {admin_username}")
            print(f"  Password: {admin_password}")
            print(f"  Role: superadmin (dengan {permission_count} permissions)")
            print("⚠️  WARNING: Please change the default password after first login!")
        else:
            db.commit()
            print("⚠️  Warning: Role superadmin tidak ditemukan, user dibuat tanpa role")
    else:
        # Jika user sudah ada, pastikan role superadmin ter-assign dan memiliki semua permissions
        superadmin_role = db.query(Role).filter(Role.name == "superadmin").first()
        if superadmin_role:
            # Pastikan user memiliki role superadmin
            if superadmin_role not in existing_superadmin.roles:
                existing_superadmin.roles.append(superadmin_role)
                db.commit()
                print("✓ Role superadmin berhasil di-assign ke user yang sudah ada")
            
            # Refresh untuk memastikan relationships ter-load
            db.refresh(existing_superadmin, ["roles"])
            db.refresh(superadmin_role, ["permissions"])
            
            # Pastikan role superadmin memiliki semua permissions
            all_perms_list = db.query(Permission).filter(Permission.guard_name == "web").all()
            if all_perms_list:
                existing_permission_ids = [perm.id for perm in superadmin_role.permissions]
                permissions_to_assign = [
                    perm for perm in all_perms_list 
                    if perm.id not in existing_permission_ids
                ]
                
                if permissions_to_assign:
                    superadmin_role.permissions.extend(permissions_to_assign)
                    db.commit()
                    db.refresh(superadmin_role, ["permissions"])
                    print(f"✓ {len(permissions_to_assign)} permissions berhasil di-assign ke role superadmin")
                
                permission_count = len(superadmin_role.permissions) if superadmin_role.permissions else 0
                print(f"✓ Superadmin user sudah ada dengan role superadmin (memiliki {permission_count} permissions)")
            else:
                print("✓ Superadmin user sudah ada, tetapi tidak ada permissions yang ditemukan")
        else:
            print("✓ Superadmin user sudah ada, tetapi role superadmin tidak ditemukan")


def init_settings(db: Session):
    """Initialize default settings."""
    print("Sedang melakukan seeding settings...")
    
    # Default settings data
    default_settings = [
        # General settings
        {
            "group": "general",
            "name": "site_name",
            "payload": "Laundry Pondok App",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "site_tagline",
            "payload": "Sistem Manajemen Laundry Pondok",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "site_description",
            "payload": "Aplikasi untuk mengelola sistem laundry pondok",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "company_name",
            "payload": "Laundry Pondok",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "company_email",
            "payload": "info@laundrypondok.com",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "company_phone",
            "payload": "+621234567890",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "company_address",
            "payload": "Jl. Contoh No. 123, Kota, Provinsi",
            "locked": 0,
        },
        {
            "group": "general",
            "name": "copyright_text",
            "payload": f"© 2026 {os.getenv('PROJECT_NAME', 'Laundry Pondok')}. All rights reserved.",
            "locked": 0,
        },
        # Appearance settings
        {
            "group": "appearance",
            "name": "site_logo",
            "payload": "",
            "locked": 0,
        },
        {
            "group": "appearance",
            "name": "site_logo_dark",
            "payload": "",
            "locked": 0,
        },
        {
            "group": "appearance",
            "name": "brand_logo_square",
            "payload": "",
            "locked": 0,
        },
        {
            "group": "appearance",
            "name": "site_favicon",
            "payload": "",
            "locked": 0,
        },
        #Order Settings
        {
            "group": "order",
            "name": "monthly_quota",
            "payload": 4,
            "locked": 0,
        },  # legacy key: batas item gratis per siswa per hari (reset harian)
        {
            "group": "order",
            "name": "price_per_item",
            "payload": 4000,
            "locked": 0,
        },

    ]
    
    for setting_data in default_settings:
        # Check if setting already exists
        existing_setting = db.query(Setting).filter(
            Setting.group == setting_data["group"],
            Setting.name == setting_data["name"]
        ).first()
        
        if not existing_setting:
            setting = Setting(**setting_data)
            db.add(setting)
            db.flush()
            print(f'✓ Setting "{setting_data["group"]}.{setting_data["name"]}" berhasil dibuat')
        else:
            print(f'✓ Setting "{setting_data["group"]}.{setting_data["name"]}" sudah ada, dilewati')
    
    db.commit()


def main():
    """Main initialization function."""
    
    # --- BAGIAN KRUSIAL: PEMBUATAN TABEL ---
    print("=" * 60)
    print("Initializing database...")
    print("=" * 60)
    
    try:
        # Perintah ini akan mengecek model dan membuat tabel jika belum ada
        print("Sedang menyelaraskan tabel database...")
        Base.metadata.create_all(bind=engine)
        print("✓ Tabel database siap!")
        print()
    except Exception as e:
        print(f"✗ Gagal membuat tabel: {e}")
        sys.exit(1)
    # ---------------------------------------

    db: Session = SessionLocal()
    try:
        # Initialize roles
        init_roles(db)
        print()
        
        # Initialize permissions
        init_permissions(db)
        print()
        
        # Initialize superadmin user
        init_superadmin_user(db)
        print()
        
        # Initialize settings
        init_settings(db)
        print()
        
        print("=" * 60)
        print("✓ Seeding selesai!")
        print("=" * 60)
    except Exception as e:
        print(f"\n✗ Error saat seeding: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
