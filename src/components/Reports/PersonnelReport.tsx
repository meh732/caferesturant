import React, { useMemo } from 'react';
import { Employee, SalaryPayment } from '../../lib/db';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel, printReportPDF } from '../../lib/reportExporter';
import { Users, Download, Printer, CreditCard, Award } from 'lucide-react';

interface PersonnelReportProps {
  employees: Employee[];
  salaryPayments: SalaryPayment[];
  filteredSalaries: SalaryPayment[];
  dateRangeText: string;
}

export default function PersonnelReport({
  employees,
  salaryPayments,
  filteredSalaries,
  dateRangeText,
}: PersonnelReportProps) {

  const activeEmployeesCount = employees.filter(e => e.isActive).length;
  const totalBaseSalaryPool = employees.reduce((sum, e) => sum + (e.baseSalary || 0), 0);
  const totalPaidInPeriod = filteredSalaries.reduce((sum, s) => sum + s.totalPaid, 0);

  // Excel Export
  const handleExportExcel = () => {
    const data = employees.map((e, idx) => {
      const empPayments = salaryPayments.filter(s => s.employeeId === e.id);
      const totalEmpPaid = empPayments.reduce((sum, s) => sum + s.totalPaid, 0);

      return {
        'ردیف': idx + 1,
        'نام و نام خانوادگی': e.name,
        'سمت شغلی': e.roleTitle,
        'حقوق پایه (تومان)': e.baseSalary,
        'نوع تسویه': e.salaryType === 'monthly' ? 'ماهانه' : e.salaryType === 'daily' ? 'روزانه' : 'ساعتی',
        'تلفن تماس': e.phone || '-',
        'شماره کارت / شبا': e.bankCard || '-',
        'مجموع پرداختی تا کنون (تومان)': totalEmpPaid,
        'وضعیت فعالیت': e.isActive ? 'فعال' : 'غیرفعال',
      };
    });

    exportToExcel(data, `گزارش_پرسنل_و_حقوق_${new Date().toLocaleDateString('fa-IR')}`);
  };

  // PDF Export
  const handlePrintPDF = () => {
    const summaryCards = [
      { label: 'تعداد پرسنل فعال', value: `${activeEmployeesCount} نفر` },
      { label: 'بودجه حقوق ماهانه', value: formatCurrency(totalBaseSalaryPool) },
      { label: 'حقوق پرداختی دوره', value: formatCurrency(totalPaidInPeriod) },
    ];

    const sections = [
      {
        title: 'لیست پرسنل و خلاصه پرداختی حقوق',
        headers: ['ردیف', 'نام و نام خانوادگی', 'سمت شغلی', 'حقوق پایه', 'شماره تماس', 'وضعیت'],
        rows: employees.map((e, i) => [
          i + 1,
          e.name,
          e.roleTitle,
          formatCurrency(e.baseSalary),
          e.phone || '-',
          e.isActive ? 'فعال' : 'غیرفعال'
        ])
      }
    ];

    printReportPDF('گزارش جامع پرسنل و حقوق', `بازه زمانی: ${dateRangeText}`, summaryCards, sections);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#5856D6]/10 text-[#5856D6] flex items-center justify-center shrink-0">
            <Users size={22} />
          </div>
          <div>
            <span className="text-xs text-neutral-500 font-medium block">تعداد پرسنل فعال</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-0.5 font-mono">{activeEmployeesCount} <span className="text-xs font-normal text-neutral-500">نفر</span></h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0">
            <CreditCard size={22} />
          </div>
          <div>
            <span className="text-xs text-neutral-500 font-medium block">کل بودجه حقوق پایه</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-0.5 font-mono">{formatCurrency(totalBaseSalaryPool)}</h3>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-2xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0">
            <Award size={22} />
          </div>
          <div>
            <span className="text-xs text-neutral-500 font-medium block">حقوق پرداختی در این بازه</span>
            <h3 className="text-xl font-bold text-neutral-900 mt-0.5 font-mono">{formatCurrency(totalPaidInPeriod)}</h3>
          </div>
        </div>

      </div>

      {/* Main Personnel Table */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-black/[0.04] bg-neutral-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#5856D6]" />
            <h3 className="font-bold text-sm text-neutral-900">لیست پرسنل و مشخصات حقوقی</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-[#34C759]/10 hover:bg-[#34C759]/20 text-[#34C759] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={14} />
              <span>خروجی اکسل</span>
            </button>

            <button
              onClick={handlePrintPDF}
              className="px-3.5 py-1.5 bg-[#007AFF] hover:bg-[#0062cc] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} />
              <span>چاپ PDF</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-neutral-100/70 text-neutral-600 font-semibold border-b border-black/[0.06]">
              <tr>
                <th className="py-3 px-4">نام و نام خانوادگی</th>
                <th className="py-3 px-4">سمت شغلی</th>
                <th className="py-3 px-4">حقوق پایه (تومان)</th>
                <th className="py-3 px-4">شماره تماس</th>
                <th className="py-3 px-4">شماره کارت / شبا</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3 px-4 font-bold text-neutral-900">{e.name}</td>
                  <td className="py-3 px-4 text-neutral-600">{e.roleTitle}</td>
                  <td className="py-3 px-4 text-[#5856D6] font-bold font-mono">{formatCurrency(e.baseSalary)}</td>
                  <td className="py-3 px-4 font-mono text-neutral-500" dir="ltr">{e.phone || '-'}</td>
                  <td className="py-3 px-4 font-mono text-neutral-500" dir="ltr">{e.bankCard || '-'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      e.isActive ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-neutral-100 text-neutral-400'
                    }`}>
                      {e.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400">اطلاعاتی ثبت نشده است.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
