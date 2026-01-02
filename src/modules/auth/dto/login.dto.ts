import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ example: '12345', description: 'Employee Matricule' })
    @IsString()
    @IsNotEmpty()
    matricule: string;

    @ApiProperty({ example: 'password123', description: 'User Password' })
    @IsString()
    @IsNotEmpty()
    password: string;
}
