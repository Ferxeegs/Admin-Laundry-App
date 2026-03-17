import { useEffect, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { reportsAPI } from "../../utils/api";

type BreakdownItem = { period: string; label: string; count: number; revenue: number };

export default function OrderChart() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsAPI.getOperationalReport({
          period: "monthly",
        });
        if (cancelled) return;
        if (res.success && res.data?.breakdown) {
          setBreakdown(res.data.breakdown);
        } else {
          setError(res.message || "Gagal memuat data");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const barOptionsBase: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "60%",
        borderRadius: 6,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    xaxis: {
      categories: breakdown.map((b) => b.label),
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    grid: {
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    fill: { opacity: 1 },
  };

  const orderCountOptions: ApexOptions = {
    ...barOptionsBase,
    colors: ["#465fff"],
    legend: { show: false },
    yaxis: {
      labels: { style: { fontSize: "12px", colors: ["#6B7280"] } },
    },
    tooltip: {
      y: { formatter: (val: number) => `${val} order` },
    },
  };

  const revenueOptions: ApexOptions = {
    ...barOptionsBase,
    colors: ["#10b981"],
    legend: { show: false },
    yaxis: {
      labels: { style: { fontSize: "12px", colors: ["#6B7280"] } },
    },
    tooltip: {
      y: {
        formatter: (val: number) =>
          `Rp ${Number(val).toLocaleString("id-ID")}`,
      },
    },
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <div className="h-5 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-5 h-[220px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 sm:h-[260px]" />
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-5 h-[220px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 sm:h-[260px]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Order per Bulan
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
          Jumlah order berdasarkan periode bulanan
        </p>
        <div className="mt-5 max-w-full overflow-x-auto pb-2 sm:pb-0">
          <div className="min-w-[280px] sm:min-w-0">
            <Chart
              options={orderCountOptions}
              series={[{ name: "Jumlah Order", data: breakdown.map((b) => b.count) }]}
              type="bar"
              height={260}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Pendapatan per Bulan
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
          Total pendapatan berdasarkan periode bulanan
        </p>
        <div className="mt-5 max-w-full overflow-x-auto pb-2 sm:pb-0">
          <div className="min-w-[280px] sm:min-w-0">
            <Chart
              options={revenueOptions}
              series={[
                {
                  name: "Pendapatan",
                  data: breakdown.map((b) => b.revenue),
                },
              ]}
              type="bar"
              height={260}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
