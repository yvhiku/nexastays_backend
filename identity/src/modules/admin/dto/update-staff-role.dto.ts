import { IsIn } from 'class-validator';
import { STAFF_ROLES, type StaffRole } from '../../users/entities/user.entity';

export class UpdateStaffRoleDto {
  @IsIn([...STAFF_ROLES])
  staffRole: StaffRole;
}
