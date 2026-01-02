-- PostgreSQL Database Schema for Leoni Application
-- Generated: 2025-12-27
-- Description: Complete database schema with normalized tables (3NF), foreign keys, indexes, and audit fields

-- ============================================
-- DROP EXISTING TABLES (if recreating)
-- ============================================
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS qr_codes CASCADE;
DROP TABLE IF EXISTS reward_usages CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS absences CASCADE;
DROP TABLE IF EXISTS point_transactions CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================
-- TABLE: roles
-- ============================================
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_roles_name ON roles(name);

-- ============================================
-- TABLE: employees (users)
-- ============================================
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    matricule VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    department VARCHAR(100),
    "group" VARCHAR(100),
    plant VARCHAR(100),
    password VARCHAR(255) NOT NULL, -- Stored as Bcrypt hash
    role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    must_change_password BOOLEAN DEFAULT TRUE,
    points_balance INTEGER DEFAULT 100,
    leave_balance INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_at TIMESTAMP,
    password_updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employees_matricule ON employees(matricule);
CREATE INDEX idx_employees_role_id ON employees(role_id);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_is_active ON employees(is_active);

-- ============================================
-- TABLE: events
-- ============================================
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    point_value INTEGER DEFAULT 0,
    event_type VARCHAR(20) DEFAULT 'SPECIAL',
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_event_type CHECK (event_type IN ('ATTENDANCE', 'PERFORMANCE', 'SPECIAL'))
);

CREATE INDEX idx_events_is_active ON events(is_active);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_dates ON events(start_date, end_date);

-- ============================================
-- TABLE: point_transactions
-- ============================================
CREATE TABLE point_transactions (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    type VARCHAR(20) DEFAULT 'EARNED',
    value INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_transaction_type CHECK (type IN ('EARNED', 'DEDUCTED', 'REDEEMED', 'ADJUSTED'))
);

CREATE INDEX idx_point_transactions_employee_id ON point_transactions(employee_id);
CREATE INDEX idx_point_transactions_event_id ON point_transactions(event_id);
CREATE INDEX idx_point_transactions_type ON point_transactions(type);
CREATE INDEX idx_point_transactions_created_at ON point_transactions(created_at);

-- ============================================
-- TABLE: absences
-- ============================================
CREATE TABLE absences (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(20) DEFAULT 'UNAUTHORIZED',
    duration INTEGER DEFAULT 1,
    absence_date DATE NOT NULL,
    points_deducted INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_absence_type CHECK (type IN ('SICK', 'PERSONAL', 'UNAUTHORIZED')),
    CONSTRAINT chk_duration CHECK (duration > 0)
);

CREATE INDEX idx_absences_employee_id ON absences(employee_id);
CREATE INDEX idx_absences_type ON absences(type);
CREATE INDEX idx_absences_absence_date ON absences(absence_date);

-- ============================================
-- TABLE: leave_requests
-- ============================================
CREATE TABLE leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(20) DEFAULT 'PERSONAL',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    reason TEXT,
    reviewed_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_leave_type CHECK (leave_type IN ('VACATION', 'SICK_LEAVE', 'PERSONAL')),
    CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_reviewed_by ON leave_requests(reviewed_by);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);

-- ============================================
-- TABLE: reward_usages
-- ============================================
CREATE TABLE reward_usages (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    reward_type VARCHAR(20) NOT NULL,
    points_spent INTEGER NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    redeemed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reward_type CHECK (reward_type IN ('CANTINE', 'XMALL', 'OTHER')),
    CONSTRAINT chk_reward_status CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_points_spent CHECK (points_spent > 0)
);

CREATE INDEX idx_reward_usages_employee_id ON reward_usages(employee_id);
CREATE INDEX idx_reward_usages_reward_type ON reward_usages(reward_type);
CREATE INDEX idx_reward_usages_status ON reward_usages(status);
CREATE INDEX idx_reward_usages_redeemed_at ON reward_usages(redeemed_at);

-- ============================================
-- TABLE: qr_codes
-- ============================================
CREATE TABLE qr_codes (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    code VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    scan_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_qr_codes_code ON qr_codes(code);
CREATE INDEX idx_qr_codes_event_id ON qr_codes(event_id);
CREATE INDEX idx_qr_codes_is_active ON qr_codes(is_active);
CREATE INDEX idx_qr_codes_expires_at ON qr_codes(expires_at);

-- ============================================
-- TABLE: notifications
-- ============================================
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'INFO',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_notification_type CHECK (type IN ('INFO', 'WARNING', 'SUCCESS', 'ERROR'))
);

CREATE INDEX idx_notifications_employee_id ON notifications(employee_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ============================================
-- TABLE: refresh_tokens
-- ============================================
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_employee_id ON refresh_tokens(employee_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- ============================================
-- TABLE: audit_logs
-- ============================================
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    target_id INTEGER,
    target_entity VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_target_id ON audit_logs(target_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- SEED DATA: roles
-- ============================================
('EMPLOYEE', 'Regular employee with basic access'),
('SUPERVISOR', 'Team supervisor with approval rights'),
('HR_ADMIN', 'HR administrator with full access');

-- MIGRATION: Update existing OPERATOR users to EMPLOYEE
-- UPDATE employees SET role_id = (SELECT id FROM roles WHERE name = 'EMPLOYEE') WHERE role_id = (SELECT id FROM roles WHERE name = 'OPERATOR');
-- DELETE FROM roles WHERE name = 'OPERATOR';


-- ============================================
-- SEED DATA: sample employees (for testing)
-- ============================================
-- Password: 'password123' hashed with bcrypt (12 rounds)
-- Hash: $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a
-- Note: 'points' is now 'points_balance'

INSERT INTO employees (matricule, full_name, email, department, password, role_id, points_balance, must_change_password) VALUES
('EMP001', 'Admin User', 'admin@leoni.com', 'HR', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a', 3, 100, TRUE),
('EMP002', 'Supervisor User', 'supervisor@leoni.com', 'Operations', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a', 2, 100, TRUE),
('EMP003', 'Employee User', 'employee@leoni.com', 'Production', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a', 1, 100, TRUE),
('10364838', 'Racem Hamdi', NULL, 'HR', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIr.yvjK6a', 3, 100, TRUE);

-- ============================================
-- TRIGGERS: Auto-update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_absences_updated_at BEFORE UPDATE ON absences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reward_usages_updated_at BEFORE UPDATE ON reward_usages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON qr_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VIEWS: Useful database views
-- ============================================

-- View: Employee points summary with transaction history
-- Adjusted column name 'points' -> 'points_balance'
CREATE OR REPLACE VIEW employee_points_summary AS
SELECT 
    e.id,
    e.matricule,
    e.full_name,
    e.department,
    e.points_balance AS current_points,
    COUNT(pt.id) AS total_transactions,
    COALESCE(SUM(CASE WHEN pt.type = 'EARNED' THEN pt.value ELSE 0 END), 0) AS total_earned,
    COALESCE(SUM(CASE WHEN pt.type = 'DEDUCTED' THEN pt.value ELSE 0 END), 0) AS total_deducted,
    COALESCE(SUM(CASE WHEN pt.type = 'REDEEMED' THEN pt.value ELSE 0 END), 0) AS total_redeemed
FROM employees e
LEFT JOIN point_transactions pt ON e.id = pt.employee_id
GROUP BY e.id, e.matricule, e.full_name, e.department, e.points_balance;

-- View: Pending leave requests
CREATE OR REPLACE VIEW pending_leave_requests AS
SELECT 
    lr.id,
    lr.employee_id,
    e.matricule,
    e.full_name,
    e.department,
    lr.leave_type,
    lr.start_date,
    lr.end_date,
    lr.reason,
    lr.created_at
FROM leave_requests lr
JOIN employees e ON lr.employee_id = e.id
WHERE lr.status = 'PENDING'
ORDER BY lr.created_at ASC;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE employees IS 'Employee information and authentication data';
COMMENT ON COLUMN employees.must_change_password IS 'Flag to force password reset on first login';
