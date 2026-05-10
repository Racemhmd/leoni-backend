import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
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
    startDate.setMonth(startDate.getMonth() - monthsToSubtract + 1);
    startDate.setDate(1);

    const qb = this.employeeSanctionRepository.createQueryBuilder('s')
      .select("TO_CHAR(s.recordDate, 'YYYY-MM')", 'month')
      .where('s.recordDate >= :startDate', { startDate });

    let results = [];

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
      
      const rawResults = await qb.getRawMany();
      results = rawResults.map(r => ({
        month: r.month,
        value: Number(r.value || 0)
      }));
    } else {
      qb.addSelect('SUM(s.renvoiCount)', 'renvoi')
        .addSelect('SUM(s.renvoiProlongeCount)', 'renvoi_prolonge')
        .addSelect('SUM(s.sansQuestionnaireCount)', 'sans_questionnaire')
        .addSelect('SUM(s.absenceContinueCount)', 'absence_continue')
        .addSelect('SUM(s.maladieDays)', 'maladie')
        .groupBy("TO_CHAR(s.recordDate, 'YYYY-MM')")
        .orderBy("TO_CHAR(s.recordDate, 'YYYY-MM')", 'ASC');
      
      const rawResults = await qb.getRawMany();
      results = rawResults.map(r => ({
        month: r.month,
        renvoi: Number(r.renvoi || 0),
        renvoi_prolonge: Number(r.renvoi_prolonge || 0),
        sans_questionnaire: Number(r.sans_questionnaire || 0),
        absence_continue: Number(r.absence_continue || 0),
        maladie: Number(r.maladie || 0),
      }));
    }

    const filledResults = [];
    const currentDate = new Date(startDate);
    
    for (let i = 0; i < monthsToSubtract; i++) {
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const monthStr = `${year}-${monthNum.toString().padStart(2, '0')}`;
      
      const found = results.find(r => r.month === monthStr);
      if (found) {
        filledResults.push(found);
      } else {
        if (type) {
          filledResults.push({ month: monthStr, value: 0 });
        } else {
          filledResults.push({ month: monthStr, renvoi: 0, renvoi_prolonge: 0, sans_questionnaire: 0, absence_continue: 0, maladie: 0 });
        }
      }
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return filledResults;
  }

  async getSanctionDetails(period: string, type?: string) {
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
    startDate.setMonth(startDate.getMonth() - monthsToSubtract + 1);
    startDate.setDate(1);

    const qb = this.employeeSanctionRepository.createQueryBuilder('s')
      .innerJoin(User, 'u', 'u.id = s.employeeId')
      .select('u.matricule', 'matricule')
      .addSelect('u.full_name', 'name')
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
      qb.groupBy('u.matricule, u.full_name');
      qb.having(`SUM(s.${columnName}) > 0`);
      qb.orderBy('value', 'DESC');
    } else {
      qb.addSelect('SUM(s.renvoiCount + s.renvoiProlongeCount + s.sansQuestionnaireCount + s.absenceContinueCount + s.maladieDays)', 'value');
      qb.groupBy('u.matricule, u.full_name');
      qb.having('SUM(s.renvoiCount + s.renvoiProlongeCount + s.sansQuestionnaireCount + s.absenceContinueCount + s.maladieDays) > 0');
      qb.orderBy('value', 'DESC');
    }

    const results = await qb.getRawMany();
    return results.map(r => ({
      matricule: r.matricule,
      name: r.name,
      value: Number(r.value || 0)
    }));
  }

  async getEmployeeSanctionHistory(matricule: string) {
    const qb = this.employeeSanctionRepository.createQueryBuilder('s')
      .where('s.matricule = :matricule', { matricule })
      .orderBy('s.recordDate', 'DESC');
    
    const results = await qb.getMany();
    
    return results.map(r => ({
      id: r.id,
      recordDate: r.recordDate,
      renvoi: r.renvoiCount || 0,
      renvoi_prolonge: r.renvoiProlongeCount || 0,
      sans_questionnaire: r.sansQuestionnaireCount || 0,
      absence_continue: r.absenceContinueCount || 0,
      maladie: r.maladieDays || 0,
      description: null
    }));
  }

  async getKpiDashboardData(period: string, matricule?: string, group?: string) {
    let monthsToSubtract = 6;
    if (period && period.endsWith('months')) {
      const num = parseInt(period.replace('months', ''), 10);
      if (!isNaN(num)) monthsToSubtract = num;
    } else if (period === '12' || period === '6' || period === '3') {
        monthsToSubtract = parseInt(period, 10);
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsToSubtract + 1);
    startDate.setDate(1);

    const qb = this.employeeSanctionRepository.createQueryBuilder('s')
      .select("TO_CHAR(s.recordDate, 'YYYY-MM')", 'month')
      .where('s.recordDate >= :startDate', { startDate });

    if (group) {
      qb.innerJoin('s.employee', 'user')
        .andWhere('user.group = :group', { group });
    }

    if (matricule) {
      qb.andWhere('s.matricule = :matricule', { matricule });
    }

    qb.addSelect('SUM(s.renvoiCount)', 'renvoi')
      .addSelect('SUM(s.renvoiProlongeCount)', 'renvoi_prolonge')
      .addSelect('SUM(s.sansQuestionnaireCount)', 'sans_questionnaire')
      .addSelect('SUM(s.absenceContinueCount)', 'absence_continue')
      .addSelect('SUM(s.maladieDays)', 'maladie')
      .groupBy("TO_CHAR(s.recordDate, 'YYYY-MM')")
      .orderBy("TO_CHAR(s.recordDate, 'YYYY-MM')", 'ASC');
    
    const rawResults = await qb.getRawMany();
    const results = rawResults.map(r => ({
      month: r.month,
      renvoi: Number(r.renvoi || 0),
      renvoi_prolonge: Number(r.renvoi_prolonge || 0),
      delays: Number(r.sans_questionnaire || 0),
      absences: Number(r.absence_continue || 0),
      sickDays: Number(r.maladie || 0),
    }));

    const filledResults = [];
    const currentDate = new Date(startDate);
    
    const totals = {
        sanctions: 0,
        absences: 0,
        delays: 0,
        sickDays: 0,
        dismissals: 0,
        extendedDismissals: 0
    };

    for (let i = 0; i < monthsToSubtract; i++) {
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const monthStr = `${year}-${monthNum.toString().padStart(2, '0')}`;
      
      const found = results.find(r => r.month === monthStr);
      if (found) {
        filledResults.push(found);
        totals.dismissals += found.renvoi;
        totals.extendedDismissals += found.renvoi_prolonge;
        totals.delays += found.delays;
        totals.absences += found.absences;
        totals.sickDays += found.sickDays;
      } else {
        filledResults.push({ month: monthStr, renvoi: 0, renvoi_prolonge: 0, delays: 0, absences: 0, sickDays: 0 });
      }
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    totals.sanctions = totals.dismissals + totals.extendedDismissals + totals.delays + totals.absences + totals.sickDays;

    return {
        totals,
        chartData: filledResults
    };
  }

  async getKpiByGroupData(period: string, groupName?: string) {
    let monthsToSubtract = 6;
    if (period === '12' || period === '6' || period === '3') {
        monthsToSubtract = parseInt(period, 10);
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsToSubtract + 1);
    startDate.setDate(1);

    const qb = this.employeeSanctionRepository.createQueryBuilder('s')
      .innerJoin('s.employee', 'user')
      .select('user.group', 'groupName')
      .where('s.recordDate >= :startDate', { startDate });

    if (groupName) {
      qb.andWhere('user.group = :groupName', { groupName });
    }

    qb.addSelect('SUM(s.renvoiCount)', 'renvoi')
      .addSelect('SUM(s.renvoiProlongeCount)', 'renvoi_prolonge')
      .addSelect('SUM(s.sansQuestionnaireCount)', 'delays')
      .addSelect('SUM(s.absenceContinueCount)', 'absences')
      .addSelect('SUM(s.maladieDays)', 'sickDays')
      .groupBy('user.group')
      .orderBy('user.group', 'ASC');

    const rawResults = await qb.getRawMany();

    return rawResults.map(r => ({
      group: r.groupName || 'UNASSIGNED',
      sanctions: Number(r.renvoi || 0) + Number(r.renvoi_prolonge || 0) + Number(r.delays || 0) + Number(r.absences || 0) + Number(r.sickDays || 0),
      absences: Number(r.absences || 0),
      delays: Number(r.delays || 0),
      sickDays: Number(r.sickDays || 0)
    }));
  }

  async getKpiByEmployee(matricule: string, period: string) {
    const user = await this.userRepository.findOne({ where: { matricule }});
    if (!user) {
        throw new NotFoundException(`Employee with matricule ${matricule} not found`);
    }

    const kpiData = await this.getKpiDashboardData(period, matricule);

    return {
        employee: {
            matricule: user.matricule,
            name: user.fullName,
            group: user.group || 'UNASSIGNED'
        },
        totals: {
            sanctions: kpiData.totals.sanctions,
            absences: kpiData.totals.absences,
            delays: kpiData.totals.delays,
            sickDays: kpiData.totals.sickDays,
            dismissals: kpiData.totals.dismissals,
            extendedDismissals: kpiData.totals.extendedDismissals
        },
        timeBasedData: kpiData.chartData
    };
  }
}
