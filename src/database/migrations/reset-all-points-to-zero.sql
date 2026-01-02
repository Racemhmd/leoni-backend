-- Migration: Reset all employee points to zero
-- Date: 2025-12-26
-- Description: This migration resets all existing employee points to 0 and updates the default value

-- ============================================
-- STEP 1: Update all existing employees' points to 0
-- ============================================
UPDATE employees 
SET points = 0, 
    updated_at = CURRENT_TIMESTAMP;

-- ============================================
-- STEP 2: Alter the default value for future employees
-- ============================================
ALTER TABLE employees 
ALTER COLUMN points SET DEFAULT 0;

-- ============================================
-- VERIFICATION: Check the results
-- ============================================
-- Uncomment the following lines to verify the migration

-- SELECT COUNT(*) as total_employees, 
--        SUM(points) as total_points,
--        AVG(points) as average_points
-- FROM employees;

-- Expected result: total_points = 0, average_points = 0
