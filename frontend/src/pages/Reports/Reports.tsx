import { useEffect, useState, useRef } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import { reportsAPI } from "../../utils/api";
import { useToast } from "../../context/ToastContext";
import { BoxIconLine, DollarLineIcon, PieChartIcon, CalenderIcon } from "../../icons";
import Button from "../../components/ui/button/Button";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";

import OperationalBreakdownChart, {
  PeriodType,
} from "../../components/charts/OperationalBreakdownChart";

interface ReportData {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    total_transactions: number;
    free_transactions: number;
    paid_transactions: number;
    total_revenue: number;
  };
  breakdown: Array<{
    period: string;
    label: string;
    count: number;
    revenue: number;
  }>;
}

export default function Reports() {
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const { error: showError } = useToast();

  // Get default dates based on period
  const getDefaultDates = () => {
    const today = new Date();

    if (period === "daily") {
      // Last 7 days (including today)
      const defaultStart = new Date(today);
      defaultStart.setDate(today.getDate() - 6);
      defaultStart.setHours(0, 0, 0, 0);
      return { defaultStart, defaultEnd: today };
    }

    if (period === "weekly") {
      // Last 8 weeks (aligned to Monday)
      const weeksBack = 8;
      const currentMonday = new Date(today);
      const day = currentMonday.getDay(); // 0 = Sunday
      const diffToMonday = day === 0 ? -6 : 1 - day;
      currentMonday.setDate(currentMonday.getDate() + diffToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      const defaultStart = new Date(currentMonday);
      defaultStart.setDate(currentMonday.getDate() - (weeksBack - 1) * 7);
      return { defaultStart, defaultEnd: today };
    }

    // Monthly: Last 6 months (from first day of month)
    const monthsBack = 6;
    const defaultStart = new Date(today.getFullYear(), today.getMonth() - (monthsBack - 1), 1);
    defaultStart.setHours(0, 0, 0, 0);
    return { defaultStart, defaultEnd: today };
  };

  // Reset date range when period changes
  useEffect(() => {
    setStartDate(null);
    setEndDate(null);
  }, [period]);

  // Helper function to get week start (Monday) and end (Sunday)
  const getWeekRange = (date: Date): { start: Date; end: Date } => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { start: weekStart, end: weekEnd };
  };

  // Helper function to get month start and end
  const getMonthRange = (date: Date): { start: Date; end: Date } => {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    return { start: monthStart, end: monthEnd };
  };

  // Initialize date picker
  useEffect(() => {
    if (!datePickerRef.current) return;

    // Destroy existing instance if any
    const existingInstance = (datePickerRef.current as any)._flatpickr;
    if (existingInstance) {
      existingInstance.destroy();
    }

    const { defaultStart, defaultEnd } = getDefaultDates();
    // Use custom dates if available, otherwise use defaults
    const defaultDates = startDate && endDate ? [startDate, endDate] : [defaultStart, defaultEnd];

    const fp = flatpickr(datePickerRef.current, {
      mode: "range",
      static: true,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      defaultDate: defaultDates,
      clickOpens: true,
      onChange: (selectedDates, _dateStr) => {
        if (period === "daily") {
          // Daily: normal range selection
          if (selectedDates.length === 2) {
            const start = selectedDates[0];
            const end = selectedDates[1];
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
          } else if (selectedDates.length === 0) {
            setStartDate(null);
            setEndDate(null);
          } else if (selectedDates.length === 1) {
            // User is selecting first date, wait for second selection
            // Don't update state yet
          }
        } else if (period === "weekly") {
          // Weekly: when user selects first date, automatically complete with week range
          if (selectedDates.length === 1) {
            const selectedDate = selectedDates[0];
            const { start, end } = getWeekRange(new Date(selectedDate));
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
            
            // Update flatpickr to show the week range
            setTimeout(() => {
              fp.setDate([start, end], false);
            }, 10);
          } else if (selectedDates.length === 2) {
            // User manually selected range, use it
            const start = selectedDates[0];
            const end = selectedDates[1];
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
          } else if (selectedDates.length === 0) {
            setStartDate(null);
            setEndDate(null);
          }
        } else if (period === "monthly") {
          // Monthly: when user selects first date, automatically complete with month range
          if (selectedDates.length === 1) {
            const selectedDate = selectedDates[0];
            const { start, end } = getMonthRange(new Date(selectedDate));
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
            
            // Update flatpickr to show the month range
            setTimeout(() => {
              fp.setDate([start, end], false);
            }, 10);
          } else if (selectedDates.length === 2) {
            // User manually selected range, use it
            const start = selectedDates[0];
            const end = selectedDates[1];
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
          } else if (selectedDates.length === 0) {
            setStartDate(null);
            setEndDate(null);
          }
        }
      },
      prevArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 15L7.5 10L12.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nextArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 15L12.5 10L7.5 5" stroke="" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });

    return () => {
      if (!Array.isArray(fp)) {
        fp.destroy();
      }
    };
  }, [period]);

  useEffect(() => {
    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, startDate, endDate]);

  const fetchReportData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params: {
        period: PeriodType;
        start_date?: string;
        end_date?: string;
      } = {
        period,
      };

      const { defaultStart, defaultEnd } = getDefaultDates();
      const toYMD = (d: string | Date) => (typeof d === "string" ? d : d.toISOString().split("T")[0]);

      // Always send a date range so breakdown contains multiple points.
      params.start_date = toYMD(startDate ?? defaultStart);
      params.end_date = toYMD(endDate ?? defaultEnd);

      const response = await reportsAPI.getOperationalReport(params);

      if (response.success && response.data) {
        setReportData(response.data);
      } else {
        const errorMessage = response.message || "Gagal memuat data laporan";
        setError(errorMessage);
        showError(errorMessage);
      }
    } catch (err: any) {
      const errorMessage = err.message || "Terjadi kesalahan saat memuat data";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resetDateRange = () => {
    setStartDate(null);
    setEndDate(null);
    if (datePickerRef.current) {
      const existingInstance = (datePickerRef.current as any)._flatpickr;
      if (existingInstance) {
        const { defaultStart, defaultEnd } = getDefaultDates();
        existingInstance.setDate([defaultStart, defaultEnd], false);
      }
    }
  };

  const formatCurrency = (amount: number): string => {
    return `Rp ${amount.toLocaleString("id-ID")}`;
  };

  const getPeriodLabel = (p: PeriodType): string => {
    switch (p) {
      case "daily":
        return "Harian";
      case "weekly":
        return "Mingguan";
      case "monthly":
        return "Bulanan";
      default:
        return "Harian";
    }
  };

  const formatDateRange = (startDate: string, endDate: string): string => {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", 
                          "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      
      const startStr = `${start.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()}`;
      const endStr = `${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
      
      return `${startStr} - ${endStr}`;
    } catch {
      return "";
    }
  };

  // Chart config sudah dipindahkan ke komponen reusable `OperationalBreakdownChart`

  return (
    <>
      <PageMeta
        title="Laporan Operasional"
        description="Laporan operasional sistem laundry pondok"
      />
      <PageBreadcrumb pageTitle="Laporan Operasional" />

      <div className="space-y-6">
        {/* Period Selector */}
        <ComponentCard title="Pilih Periode Laporan">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Jenis Periode
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant={period === "daily" ? "primary" : "outline"}
                  onClick={() => setPeriod("daily")}
                  className="min-w-[100px]"
                  disabled={isLoading}
                >
                  Harian
                </Button>
                <Button
                  variant={period === "weekly" ? "primary" : "outline"}
                  onClick={() => setPeriod("weekly")}
                  className="min-w-[100px]"
                  disabled={isLoading}
                >
                  Mingguan
                </Button>
                <Button
                  variant={period === "monthly" ? "primary" : "outline"}
                  onClick={() => setPeriod("monthly")}
                  className="min-w-[100px]"
                  disabled={isLoading}
                >
                  Bulanan
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {period === "daily" 
                  ? "Rentang Tanggal" 
                  : period === "weekly" 
                  ? "Pilih Minggu" 
                  : "Pilih Bulan"}
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    ref={datePickerRef}
                    id="date-range-picker"
                    placeholder={
                      period === "daily"
                        ? "Pilih rentang tanggal"
                        : period === "weekly"
                        ? "Klik tanggal untuk memilih minggu"
                        : "Klik tanggal untuk memilih bulan"
                    }
                    className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 pl-11 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:border-gray-700 dark:focus:border-brand-800"
                    readOnly
                  />
                  <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none left-3 top-1/2 dark:text-gray-400">
                    <CalenderIcon className="size-5" />
                  </span>
                </div>
                {(startDate || endDate) && (
                  <Button
                    variant="outline"
                    onClick={resetDateRange}
                    className="whitespace-nowrap"
                    disabled={isLoading}
                  >
                    Reset
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {period === "daily"
                  ? "Pilih rentang tanggal untuk melihat laporan. Jika tidak dipilih, akan menggunakan periode default berdasarkan jenis periode yang dipilih."
                  : period === "weekly"
                  ? "Klik tanggal di kalender untuk memilih minggu (Senin-Minggu). Sistem akan otomatis memilih seluruh minggu."
                  : "Klik tanggal di kalender untuk memilih bulan. Sistem akan otomatis memilih seluruh bulan."}
              </p>
            </div>

            {reportData && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Periode Laporan:</span>{" "}
                    {formatDateRange(reportData.start_date, reportData.end_date)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    {reportData.breakdown.length} {period === "daily" ? "hari" : period === "weekly" ? "minggu" : "bulan"} data
                  </p>
                </div>
              </div>
            )}
          </div>
        </ComponentCard>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            <div className="text-gray-500 dark:text-gray-400">Memuat data laporan...</div>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/10">
            <p className="text-red-600 dark:text-red-400 font-medium mb-2">Gagal Memuat Data</p>
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            <Button
              variant="outline"
              onClick={fetchReportData}
              className="mt-4"
            >
              Coba Lagi
            </Button>
          </div>
        ) : reportData ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Total Transactions */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-xl dark:bg-blue-900/30">
                  <BoxIconLine className="text-blue-600 size-6 dark:text-blue-400" />
                </div>
                <div className="mt-5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Total Transaksi
                  </span>
                  <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                    {reportData.summary.total_transactions.toLocaleString("id-ID")}
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Periode {getPeriodLabel(period).toLowerCase()}
                  </p>
                </div>
              </div>

              {/* Free Transactions */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-xl dark:bg-green-900/30">
                  <PieChartIcon className="text-green-600 size-6 dark:text-green-400" />
                </div>
                <div className="mt-5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Transaksi Gratis
                  </span>
                  <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                    {reportData.summary.free_transactions.toLocaleString("id-ID")}
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {reportData.summary.total_transactions > 0
                      ? (
                          (reportData.summary.free_transactions /
                            reportData.summary.total_transactions) *
                          100
                        ).toFixed(1)
                      : 0}
                    % dari total transaksi
                  </p>
                </div>
              </div>

              {/* Paid Transactions */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-xl dark:bg-purple-900/30">
                  <BoxIconLine className="text-purple-600 size-6 dark:text-purple-400" />
                </div>
                <div className="mt-5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Transaksi Berbayar
                  </span>
                  <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                    {reportData.summary.paid_transactions.toLocaleString("id-ID")}
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {reportData.summary.total_transactions > 0
                      ? (
                          (reportData.summary.paid_transactions /
                            reportData.summary.total_transactions) *
                          100
                        ).toFixed(1)
                      : 0}
                    % dari total transaksi
                  </p>
                </div>
              </div>

              {/* Total Revenue */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-center w-12 h-12 bg-yellow-100 rounded-xl dark:bg-yellow-900/30">
                  <DollarLineIcon className="text-yellow-600 size-6 dark:text-yellow-400" />
                </div>
                <div className="mt-5">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Total Pendapatan
                  </span>
                  <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
                    {formatCurrency(reportData.summary.total_revenue)}
                  </h4>
                  {reportData.summary.paid_transactions > 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Rata-rata {formatCurrency(
                        reportData.summary.total_revenue / reportData.summary.paid_transactions
                      )} per transaksi
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Transaction Count Chart */}
              <ComponentCard
                title={`Grafik Jumlah Transaksi (${getPeriodLabel(period)})`}
                desc="Visualisasi jumlah transaksi per periode"
              >
                <div className="max-w-full overflow-x-auto custom-scrollbar">
                  <div className="min-w-[400px]">
                    <OperationalBreakdownChart
                      period={period}
                      breakdown={reportData.breakdown}
                      variant="transactions"
                      height={300}
                    />
                  </div>
                </div>
              </ComponentCard>

              {/* Revenue Chart */}
              <ComponentCard
                title={`Grafik Pendapatan (${getPeriodLabel(period)})`}
                desc="Visualisasi pendapatan laundry per periode"
              >
                <div className="max-w-full overflow-x-auto custom-scrollbar">
                  <div className="min-w-[400px]">
                    <OperationalBreakdownChart
                      period={period}
                      breakdown={reportData.breakdown}
                      variant="revenue"
                      height={300}
                    />
                  </div>
                </div>
              </ComponentCard>
            </div>

            {/* Transaction Breakdown Table */}
            <ComponentCard
              title="Rincian Transaksi"
              desc={`Detail transaksi per ${getPeriodLabel(period).toLowerCase()}`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Periode
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                        Jumlah Transaksi
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                        Pendapatan
                      </th>
                      {period === "weekly" || period === "monthly" ? (
                        <th className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                          Rata-rata
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.breakdown.length > 0 ? (
                      reportData.breakdown.map((item, index) => (
                        <tr
                          key={index}
                          className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                            {item.label}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200 text-right">
                            {item.count.toLocaleString("id-ID")}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200 text-right">
                            {formatCurrency(item.revenue)}
                          </td>
                          {period === "weekly" || period === "monthly" ? (
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right">
                              {item.count > 0
                                ? formatCurrency(item.revenue / item.count)
                                : formatCurrency(0)}
                            </td>
                          ) : null}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={period === "weekly" || period === "monthly" ? 4 : 3}
                          className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                        >
                          Tidak ada data untuk periode ini
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ComponentCard>
          </>
        ) : null}
      </div>
    </>
  );
}

