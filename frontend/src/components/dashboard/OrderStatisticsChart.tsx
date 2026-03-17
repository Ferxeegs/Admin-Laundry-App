import { useEffect, useRef, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import flatpickr from "flatpickr";
import "flatpickr/dist/themes/light.css";
import { CalenderIcon } from "../../icons";
import { reportsAPI } from "../../utils/api";

type PeriodType = "daily" | "weekly" | "monthly";

export default function OrderStatisticsChart() {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<
    Array<{ period: string; label: string; count: number; revenue: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: {
        period: PeriodType;
        start_date?: string;
        end_date?: string;
      } = { period };
      if (startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      }
      const res = await reportsAPI.getOperationalReport(params);
      if (res.success && res.data?.breakdown) {
        setBreakdown(res.data.breakdown);
      } else {
        setError(res.message || "Gagal memuat data");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (!datePickerRef.current) return;

    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(today.getDate() - 6);

    const fp = flatpickr(datePickerRef.current, {
      mode: "range",
      static: true,
      monthSelectorType: "static",
      dateFormat: "Y-m-d",
      defaultDate: [defaultStart, today],
      clickOpens: true,
      onChange: (dates: Date[]) => {
        if (dates.length >= 2) {
          setStartDate(dates[0].toISOString().slice(0, 10));
          setEndDate(dates[1].toISOString().slice(0, 10));
        }
      },
      prevArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      nextArrow:
        '<svg class="stroke-current" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M7.5 15L12.5 10L7.5 5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });

    return () => {
      if (!Array.isArray(fp)) fp.destroy();
    };
  }, []);

  useEffect(() => {
    if (startDate && endDate) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 310,
      type: "area",
      toolbar: { show: false },
    },
    colors: ["#465FFF", "#10b981"],
    stroke: { curve: "smooth", width: [2, 2] },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.4, opacityTo: 0.05 },
    },
    markers: { size: 0, strokeColors: "#fff", strokeWidth: 2 },
    grid: {
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: breakdown.map((b) => b.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { fontSize: "12px", colors: ["#6B7280"] } },
    },
    tooltip: {
      y: {
        formatter: (val: number, opts?: { seriesIndex?: number }) =>
          opts?.seriesIndex === 0
            ? `${val} order`
            : `Rp ${Number(val).toLocaleString("id-ID")}`,
      },
    },
  };

  const series = [
    { name: "Jumlah Order", data: breakdown.map((b) => b.count) },
    { name: "Pendapatan (Rp)", data: breakdown.map((b) => b.revenue) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-5 sm:pb-5 sm:pt-5 md:px-6 md:pt-6">
      <div className="mb-4 flex flex-col gap-4 sm:mb-5 sm:flex-row sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            Statistik Order
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Tren order dan pendapatan menurut periode
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                  period === p
                    ? "bg-brand-500 text-white dark:bg-brand-600"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                }`}
              >
                {p === "daily" ? "Harian" : p === "weekly" ? "Mingguan" : "Bulanan"}
              </button>
            ))}
          </div>
          <div className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-[160px]">
            <CalenderIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none sm:size-5" />
            <input
              ref={datePickerRef}
              className="h-9 w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-9 pr-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 sm:h-10 sm:min-w-[160px] sm:py-2 sm:pl-10"
              placeholder="Rentang tanggal"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400 sm:mb-4">{error}</p>
      )}

      {loading ? (
        <div className="h-[260px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 sm:h-[310px]" />
      ) : (
        <div className="max-w-full overflow-x-auto pb-2 -mx-1 sm:mx-0 sm:pb-0">
          <div className="min-w-[320px] sm:min-w-[500px]">
            <Chart options={options} series={series} type="area" height={310} />
          </div>
        </div>
      )}
    </div>
  );
}
