-- ============================================================================
-- Migration: Add role_id column to module_permissions table
-- ============================================================================
-- Purpose: Permissions should be scoped by department + role, not just department.
--   - Admin (role) → full access (all CRUD)
--   - Manager → custom permissions set by admin during registration
--   - User → view-only access
--
-- Steps:
-- 1. Add role_id column (FK to roles.id)
-- 2. Drop old UNIQUE constraint on (department_id, module_id)
-- 3. Add new UNIQUE constraint on (department_id, role_id, module_id)
-- ============================================================================

-- Step 1: Add role_id column
ALTER TABLE module_permissions
ADD COLUMN role_id INT NOT NULL AFTER department_id;

-- Step 2: Add foreign key constraint
ALTER TABLE module_permissions
ADD CONSTRAINT fk_module_permissions_role
FOREIGN KEY (role_id) REFERENCES roles(id);

-- Step 3: Drop old unique constraint
-- NOTE: The constraint name may differ in your DB. Check with:
--   SHOW INDEX FROM module_permissions;
-- Common names: department_id, unique_dept_module, etc.
ALTER TABLE module_permissions
DROP INDEX department_id;

-- Step 4: Add new unique constraint (department + role + module)
ALTER TABLE module_permissions
ADD UNIQUE KEY unique_dept_role_module (department_id, role_id, module_id);

-- ============================================================================
-- Optional: Backfill existing rows with a default role_id
-- If you have existing data, you'll need to assign a role_id before the NOT NULL
-- constraint takes effect. Run this BEFORE the ALTER TABLE above if you have data:
--
-- UPDATE module_permissions mp
-- SET mp.role_id = (
--   SELECT MIN(u.role_id)
--   FROM users u
--   WHERE u.department_id = mp.department_id
--   LIMIT 1
-- );
-- ============================================================================
