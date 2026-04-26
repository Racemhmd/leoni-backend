import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeSanction } from '../../database/entities/sanction-history.entity';
import { User } from '../../database/entities/user.entity';
import * as xlsx from 'xlsx';

@Injectable()
export class SanctionsService {
  constructor(
    @InjectRepository(EmployeeSanction)
    private employeeSanctionRepository: Repository<EmployeeSanction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async importSanctions(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    let data: any[];
    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      data = xlsx.utils.sheet_to_json(sheet);
    } catch (error) {
      throw new BadRequestException('Invalid file format. Please upload a valid CSV or Excel file.');
    }

    if (!data || data.length === 0) {
      throw new BadRequestException('The uploaded file is empty');
    }

    const report: {
      total: number;
      successCount: number;
      errorCount: number;
      errors: { row: number; matricule: string; error: string }[];
    } = {
      total: data.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
    };

    const expectedFields = ['matricule', 'renvoi', 'renvoi prolongé', 'sans questionnaire', 'continuous absences', 'sick days', 'period'];
    const normalizeKey = (key: string) => key.toLowerCase().trim().replace(/_/g, ' ');

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowIndex = i + 2; // +1 for 0-index, +1 for header

      try {
        const normalizedRow: any = {};
        for (const key of Object.keys(row)) {
          normalizedRow[normalizeKey(key)] = row[key];
        }

        const matricule = normalizedRow['matricule'];
        if (!matricule) {
          throw new Error('Matricule is missing');
        }

        const user = await this.userRepository.findOne({ where: { matricule: matricule.toString() } });
        if (!user) {
          throw new Error(`User with matricule ${matricule} not found`);
        }

        const parseIntSafe = (val: any) => {
          if (val === undefined || val === null || val === '') return 0;
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) throw new Error(`Invalid number format: ${val}`);
          return parsed;
        };

        const dismissals = parseIntSafe(normalizedRow['renvoi']);
        const extendedDismissals = parseIntSafe(normalizedRow['renvoi prolonge'] || normalizedRow['renvoi prolongé']);
        const sansQuestionnaire = parseIntSafe(normalizedRow['sans questionnaire']);
        const continuousAbsences = parseIntSafe(normalizedRow['continuous absences'] || normalizedRow['absences continues']);
        const sickDays = parseIntSafe(normalizedRow['sick days'] || normalizedRow['jours de maladie']);
        const recordDateRaw = normalizedRow['record date'] || normalizedRow['period'] || normalizedRow['periode'] || normalizedRow['période'] || normalizedRow['date'] || null;
        let recordDate = null;
        if (recordDateRaw) {
          const parsedDate = new Date(recordDateRaw);
          if (!isNaN(parsedDate.getTime())) {
            recordDate = parsedDate;
          }
        }

        let sanction = null;
        if (recordDate) {
          sanction = await this.employeeSanctionRepository.findOne({
            where: { matricule: user.matricule, recordDate: recordDate },
          });
        }

        if (!sanction) {
          sanction = this.employeeSanctionRepository.create({
            matricule: user.matricule,
            employeeId: user.id,
            recordDate: recordDate,
          });
        }

        sanction.renvoiCount = dismissals;
        sanction.renvoiProlongeCount = extendedDismissals;
        sanction.sansQuestionnaireCount = sansQuestionnaire;
        sanction.absenceContinueCount = continuousAbsences;
        sanction.maladieDays = sickDays;

        await this.employeeSanctionRepository.save(sanction);
        report.successCount++;
      } catch (error) {
        report.errorCount++;
        report.errors.push({
          row: rowIndex,
          matricule: row['matricule'] || 'Unknown',
          error: error.message,
        });
      }
    }

    return report;
  }

  async getSanctionStats(period: string, type?: string) {
    let monthsToSubtract = 6;
    if (period && period.endsWith('months')) {
      const num = parseInt(period.replace('months', ''), 10);
      if (!isNaN(num)) monthsToSubtract = num;
    } else if (period && period.endsWith('month')) {
      monthsToSubtract = 1;
    } else if (period === 'yearly' || period === 'year') {
      monthsToSubtract = 12;
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsToSubtract);
    startDate.setDate(1);

    const qb = this.employeeSanctionRepository.createQueryBuilder('s')
      .select("TO_CHAR(s.recordDate, 'YYYY-MM')", 'month')
      .where('s.recordDate >= :startDate', { startDate });

    if (type) {
      let columnName = '';
      switch (type) {
        case 'renvoi': columnName = 'renvoiCount'; break;
        case 'renvoi_prolonge': columnName = 'renvoiProlongeCount'; break;
        case 'sans_questionnaire': columnName = 'sansQuestionnaireCount'; break;
        case 'absence_continue': columnName = 'absenceContinueCount'; break;
        case 'maladie': columnName = 'maladieDays'; break;
        default: throw new BadRequestException(`Unknown sanction type: ${type}`);
      }
      qb.addSelect(`SUM(s.${columnName})`, 'value');
      qb.groupBy("TO_CHAR(s.recordDate, 'YYYY-MM')");
      qb.orderBy("TO_CHAR(s.recordDate, 'YYYY-MM')", 'ASC');
      
      const results = await qb.getRawMany();
      return results.map(r => ({
        month: r.month,
        value: Number(r.value)
      }));
    } else {
      qb.addSelect('SUM(s.renvoiCount)', 'renvoi')
        .addSelect('SUM(s.renvoiProlongeCount)', 'renvoi_prolonge')
        .addSelect('SUM(s.sansQuestionnaireCount)', 'sans_questionnaire')
        .addSelect('SUM(s.absenceContinueCount)', 'absence_continue')
        .addSelect('SUM(s.maladieDays)', 'maladie')
        .groupBy("TO_CHAR(s.recordDate, 'YYYY-MM')")
        .orderBy("TO_CHAR(s.recordDate, 'YYYY-MM')", 'ASC');
      
      const results = await qb.getRawMany();
      return results.map(r => ({
        month: r.month,
        renvoi: Number(r.renvoi),
        renvoi_prolonge: Number(r.renvoi_prolonge),
        sans_questionnaire: Number(r.sans_questionnaire),
        absence_continue: Number(r.absence_continue),
        maladie: Number(r.maladie),
      }));
    }
  }
}
