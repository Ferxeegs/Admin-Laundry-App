import { useEffect, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { reportsAPI } from "../../utils/api";

const formatCurrency = (amount: number) =>
  `Rp ${amount.toLocaleString("id-ID")}`;

export default function MonthlyTargetCard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    total_transactions: number;
    total_revenue: number;
    free_transactions: number;
    paid_transactions: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsAPI.getOperationalReport({ period: "monthly" });
        if (cancelled) return;
        if (res.success && res.data?.summary) {
          setSummary(res.data.summary);
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

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse">
        <div className="rounded-xl bg-white px-4 pb-8 pt-4 dark:bg-gray-900 sm:px-5 sm:pb-10 sm:pt-5 md:px-6 md:pt-6">
          <div className="h-5 w-36 rounded bg-gray-200 dark:bg-gray-700 sm:h-6 sm:w-40" />
          <div className="mt-2 h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-6 h-[180px] rounded-full bg-gray-200 dark:bg-gray-700 sm:mt-8 sm:h-[200px]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Realisasi Bulan Ini
        </h3>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  const monthName = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  const radialOptions: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "radialBar",
      height: 220,
    },
    colors: ["#465FFF"],
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        hollow: { size: "65%" },
        track: {
          background: "#E4E7EC",
          strokeWidth: "100%",
          margin: 8,
        },
        dataLabels: {
          name: { show: false },
          value: {
            fontSize: "28px",
            fontWeight: "600",
            offsetY: -5,
            color: "#1D2939",
            formatter: () => summary.total_transactions.toString(),
          },
        },
      },
    },
    fill: { type: "solid", colors: ["#465FFF"] },
    stroke: { lineCap: "round" },
    labels: ["Order"],
  };

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="rounded-xl bg-gray-50 px-4 pb-8 pt-4 dark:bg-gray-900/50 sm:px-5 sm:pb-10 sm:pt-5 md:px-6 md:pt-6">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            Realisasi {monthName}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Ringkasan order dan pendapatan bulan berjalan
          </p>
        </div>
        <div className="relative mt-4">
          <Chart
            options={radialOptions}
            series={[100]}
            type="radialBar"
            height={220}
          />
          <p className="absolute left-1/2 top-[calc(50%+1rem)] -translate-x-1/2 -translate-y-1/2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
            Total order
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-[320px] text-center text-sm text-gray-500 dark:text-gray-400">
          {summary.total_transactions} order ({summary.free_transactions} gratis,{" "}
          {summary.paid_transactions} berbayar). Pendapatan tambahan:{" "}
          {formatCurrency(summary.total_revenue)}.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:gap-6 sm:px-6 sm:py-4 md:gap-8">
        <div className="text-center">
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Order
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            {summary.total_transactions}
          </p>
        </div>
        <div className="h-8 w-px bg-gray-200 dark:bg-gray-800" />
        <div className="text-center">
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Pendapatan
          </p>
          <p className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            {formatCurrency(summary.total_revenue)}
          </p>
        </div>
      </div>
    </div>
  );
}
