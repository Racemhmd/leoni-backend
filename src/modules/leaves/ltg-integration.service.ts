import { Injectable, Logger } from '@nestjs/common';
import { LeaveRequest, LeaveStatus } from '../../database/entities/leave.entity';

@Injectable()
export class LtgIntegrationService {
    private readonly logger = new Logger(LtgIntegrationService.name);

    // In-memory mock storage for demo purposes
    private ltgRequests = new Map<number, { status: LeaveStatus; ltgId: string }>();

    /**
     * Submits a leave request to the external LTG system.
     * In a real app, this would call an external API.
     */
    async submitToLtg(leaveRequest: LeaveRequest): Promise<{ success: boolean; ltgId: string; message: string }> {
        this.logger.log(`Submitting leave request #${leaveRequest.id} for Employee ${leaveRequest.employeeId} to LTG System...`);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Generate a mock LTG Transaction ID
        const ltgId = `LTG-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000)}`;

        // Store mock state
        this.ltgRequests.set(leaveRequest.id, {
            status: LeaveStatus.PENDING_LTG,
            ltgId: ltgId
        });

        this.logger.log(`Request #${leaveRequest.id} submitted to LTG. Transaction ID: ${ltgId}`);

        return {
            success: true,
            ltgId,
            message: 'Request successfully queued in LTG for Supervisor validation'
        };
    }

    /**
     * Checks the status of a request in LTG.
     * This simulates the "Application fetching updated status" step.
     */
    async pollLtgStatus(leaveRequestId: number): Promise<LeaveStatus> {
        const record = this.ltgRequests.get(leaveRequestId);
        if (!record) {
            // Default to pending supervisor if newly created and not tracked
            return LeaveStatus.PENDING_SUPERVISOR;
        }

        // Simulate State Machine for Demo:
        // PENDING_LTG (Initial) -> PENDING_SUPERVISOR (Immediate)
        // PENDING_SUPERVISOR -> APPROVED_SUPERVISOR (after delay)
        // APPROVED_SUPERVISOR -> APPROVED_HR (after delay) -> LTG_APPROVED (Final)

        const rand = Math.random();

        switch (record.status) {
            case LeaveStatus.PENDING_LTG:
                record.status = LeaveStatus.PENDING_SUPERVISOR;
                break;

            case LeaveStatus.PENDING_SUPERVISOR:
                // 80% chance to approve, 20% reject (simulated after some polls)
                if (rand > 0.8) {
                    record.status = LeaveStatus.APPROVED_SUPERVISOR;
                } else if (rand < 0.05) {
                    record.status = LeaveStatus.REJECTED_SUPERVISOR;
                }
                break;

            case LeaveStatus.APPROVED_SUPERVISOR:
                // Move to HR
                if (rand > 0.5) {
                    record.status = LeaveStatus.PENDING_HR; // Sometimes it takes time to reach HR queue
                } else {
                    record.status = LeaveStatus.APPROVED_HR; // Simulating HR approval directly for speed in demo
                }
                break;

            case LeaveStatus.PENDING_HR:
                if (rand > 0.7) {
                    record.status = LeaveStatus.LTG_APPROVED;
                } else if (rand < 0.05) {
                    record.status = LeaveStatus.REJECTED_HR;
                }
                break;

            case LeaveStatus.APPROVED_HR:
                record.status = LeaveStatus.LTG_APPROVED;
                break;
        }

        return record.status;
    }

    /**
     * Force a status for testing/demo (Optional helper)
     */
    async forceEvaluate(leaveRequestId: number, status: LeaveStatus): Promise<void> {
        const record = this.ltgRequests.get(leaveRequestId);
        if (record) {
            record.status = status;
        }
    }
}
