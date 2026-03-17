import { useEffect, useState } from "react";
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { reportsAPI } from "../../utils/api";

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Diterima",
  WASHING_DRYING: "Cuci & Kering",
  IRONING: "Setrika",
  COMPLETED: "Selesai",
  PICKED_UP: "Diambil",
};

const PIE_COLORS = ["#465fff", "#f59e0b", "#10b981", "#8b5cf6"];

export default function OrderStatusPieChart() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [byStatus, setByStatus] = useState<Array<{ status: string; count: number }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await reportsAPI.getOrdersByStatus();
        if (cancelled) return;
        if (res.success && res.data) {
          setByStatus(res.data.by_status);
        } else {
          setError(res.message || "Gagal memuat data");
          setByStatus([]);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
          setByStatus([]);
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

  const excludedStatus = "PICKED_UP";
  const filtered = byStatus.filter((s) => s.status !== excludedStatus);
  const labels = filtered.map(
    (s) => `${STATUS_LABEL[s.status] ?? s.status} (${s.count})`
  );
  const series = filtered.map((s) => s.count);
  const total = series.reduce((a, b) => a + b, 0);

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "donut",
      height: 300,
    },
    colors: PIE_COLORS,
    labels,
    legend: {
      position: "bottom",
      horizontalAlign: "center",
      fontSize: "12px",
    },
    dataLabels: {
      enabled: true,
      formatter: (val: number) => (total > 0 ? `${Math.round(val)}%` : "0%"),
    },
    plotOptions: {
      pie: {
        donut: {
          size: "55%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Dalam proses",
              formatter: () => total.toString(),
            },
          },
        },
      },
    },
    tooltip: {
      y: {
        formatter: (val: number) => `${val} order`,
      },
    },
  };

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Order dalam Proses (per Status)
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
          Distribusi order menurut status, kecuali yang sudah diambil
        </p>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {loading ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      ) : total === 0 ? (
        <div className="flex h-[260px] flex-col items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800/50 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tidak ada order dalam proses.
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Semua order sudah diambil atau belum ada data.
          </p>
        </div>
      ) : (
        <Chart options={options} series={series} type="donut" height={300} />
      )}
    </div>
  );
}
