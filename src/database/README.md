# Database Schema Documentation

## Overview
This document provides comprehensive documentation for the Leoni Application database schema, including entity relationships, usage examples, and best practices.

## Quick Start

### Running the SQL Schema
```bash
# Connect to PostgreSQL
psql -U postgres -d leoni_db

# Execute the schema
\i src/database/schema.sql
```

### Using TypeORM Entities
```typescript
import { User, Role, PointTransaction } from './database/entities';
```

## Entity Relationships

### User (Employee)
- **Has one** Role (many-to-one)
- **Has one** Supervisor (self-referencing, many-to-one)
- **Has many** PointTransactions
- **Has many** Absences
- **Has many** LeaveRequests
- **Has many** RewardUsages
- **Has many** Notifications
- **Has many** RefreshTokens

### Event
- **Has many** PointTransactions
- **Has many** QRCodes

### LeaveRequest
- **Belongs to** Employee (requester)
- **Belongs to** Employee (reviewer, optional)

## Common Queries

### Get Employee with Points Summary
```typescript
const employee = await userRepository
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.role', 'role')
  .where('user.id = :id', { id: employeeId })
  .getOne();
```

### Get Point Transaction History
```typescript
const transactions = await pointTransactionRepository
  .createQueryBuilder('transaction')
  .leftJoinAndSelect('transaction.employee', 'employee')
  .leftJoinAndSelect('transaction.event', 'event')
  .where('transaction.employeeId = :employeeId', { employeeId })
  .orderBy('transaction.createdAt', 'DESC')
  .getMany();
```

### Get Pending Leave Requests for Supervisor
```typescript
const pendingLeaves = await leaveRequestRepository
  .createQueryBuilder('leave')
  .leftJoinAndSelect('leave.employee', 'employee')
  .leftJoinAndSelect('employee.supervisor', 'supervisor')
  .where('supervisor.id = :supervisorId', { supervisorId })
  .andWhere('leave.status = :status', { status: LeaveStatus.PENDING })
  .getMany();
```

### Get Active Events with QR Codes
```typescript
const activeEvents = await eventRepository
  .createQueryBuilder('event')
  .leftJoinAndSelect('event.qrCodes', 'qrCode')
  .where('event.isActive = :isActive', { isActive: true })
  .andWhere('event.startDate <= :now', { now: new Date() })
  .andWhere('event.endDate >= :now', { now: new Date() })
  .getMany();
```

## Enums Reference

### UserRole (Legacy)
- `EMPLOYEE`: Regular employee
- `SUPERVISOR`: Team supervisor
- `HR_ADMIN`: HR administrator

### TransactionType
- `EARNED`: Points earned from events
- `DEDUCTED`: Points deducted (absences, penalties)
- `REDEEMED`: Points spent on rewards
- `ADJUSTED`: Manual point adjustments

### EventType
- `ATTENDANCE`: Attendance-based events
- `PERFORMANCE`: Performance-based events
- `SPECIAL`: Special events

### AbsenceType
- `SICK`: Sick leave
- `PERSONAL`: Personal absence
- `UNAUTHORIZED`: Unauthorized absence

### LeaveType
- `VACATION`: Vacation leave
- `SICK_LEAVE`: Sick leave request
- `PERSONAL`: Personal leave

### LeaveStatus
- `PENDING`: Awaiting review
- `APPROVED`: Approved by supervisor/HR
- `REJECTED`: Rejected

### RewardType
- `CANTINE`: Cafeteria rewards
- `XMALL`: Shopping mall vouchers
- `OTHER`: Other rewards

### RewardStatus
- `PENDING`: Redemption pending
- `COMPLETED`: Redemption completed
- `CANCELLED`: Redemption cancelled

### NotificationType
- `INFO`: Informational
- `WARNING`: Warning
- `SUCCESS`: Success message
- `ERROR`: Error message

## Indexes

All entities have appropriate indexes for performance:
- Primary keys (auto-indexed)
- Foreign keys
- Frequently queried fields (status, type, dates)
- Composite indexes for date ranges

## Constraints

### Check Constraints
- Transaction types must be valid enum values
- Absence duration must be positive
- Leave end date must be >= start date
- Points spent must be positive

### Foreign Key Constraints
- Cascade delete for dependent records (transactions, absences, etc.)
- Set null for optional relationships (reviewer, supervisor)

## Seed Data

### Default Roles
1. **EMPLOYEE** (id: 1): Regular employee with basic access
2. **SUPERVISOR** (id: 2): Team supervisor with approval rights
3. **HR_ADMIN** (id: 3): HR administrator with full access

### Test Users
- **EMP001**: Admin User (password: `password123`)
- **EMP002**: Supervisor User (password: `password123`)
- **EMP003**: Employee User (password: `password123`)

## Database Views

### employee_points_summary
Aggregated view of employee points with transaction breakdown.

```sql
SELECT * FROM employee_points_summary WHERE matricule = 'EMP001';
```

### pending_leave_requests
All pending leave requests with employee details.

```sql
SELECT * FROM pending_leave_requests ORDER BY created_at;
```

## Migration Strategy

### Development
TypeORM synchronize is enabled (`synchronize: true`) for automatic schema updates.

### Production
1. Disable synchronize
2. Use TypeORM migrations:
```bash
npm run typeorm migration:generate -- -n MigrationName
npm run typeorm migration:run
```

## Best Practices

1. **Always use transactions** for operations affecting multiple tables
2. **Use query builders** for complex queries with joins
3. **Leverage indexes** for frequently queried fields
4. **Use enums** for type safety and validation
5. **Implement soft deletes** for critical data (if needed)
6. **Regular backups** of production database
7. **Monitor query performance** using PostgreSQL EXPLAIN

## Performance Tips

1. Use `select` option to fetch only needed fields
2. Use pagination for large result sets
3. Leverage database views for complex aggregations
4. Use partial indexes for filtered queries
5. Regularly analyze and vacuum tables

## Security Considerations

1. **Never expose passwords** (use `select: false`)
2. **Validate all inputs** before database operations
3. **Use parameterized queries** to prevent SQL injection
4. **Implement row-level security** for sensitive data
5. **Audit critical operations** (track who did what)
6. **Encrypt sensitive data** at rest and in transit
