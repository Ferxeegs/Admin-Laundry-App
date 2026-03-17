import { useEffect, useState } from "react";
import { GroupIcon, PieChartIcon, SettingsIcon } from "../../icons";
import { studentAPI, settingAPI } from "../../utils/api";

const formatCurrency = (amount: number) =>
  `Rp ${amount.toLocaleString("id-ID")}`;

export default function DashboardMetrics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalStudents: number;
    monthlyQuota: number;
    pricePerItem: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const [studentsRes, settingsRes] = await Promise.all([
          studentAPI.getAllStudents({ page: 1, limit: 1, is_active: true }),
          settingAPI.getByGroup("order"),
        ]);

        if (cancelled) return;

        const totalStudents =
          studentsRes.success && studentsRes.data?.pagination
            ? studentsRes.data.pagination.total
            : 0;

        const orderSettings = settingsRes.success ? settingsRes.data : {};
        const monthlyQuota =
          typeof orderSettings?.monthly_quota === "number"
            ? orderSettings.monthly_quota
            : typeof orderSettings?.monthly_quota === "string"
              ? parseInt(orderSettings.monthly_quota, 10) || 4
              : 4;
        const pricePerItem =
          typeof orderSettings?.price_per_item === "number"
            ? orderSettings.price_per_item
            : typeof orderSettings?.price_per_item === "string"
              ? parseFloat(orderSettings.price_per_item) || 4000
              : 4000;

        setStats({
          totalStudents,
          monthlyQuota,
          pricePerItem,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse"
          >
            <div className="h-11 w-11 rounded-xl bg-gray-200 dark:bg-gray-700 sm:h-12 sm:w-12" />
            <div className="mt-4 h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-2 h-6 w-16 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: "Total Siswa",
      value: stats.totalStudents.toLocaleString("id-ID"),
      icon: GroupIcon,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Kuota Gratis Bulanan",
      value: `${stats.monthlyQuota} item`,
      sub: "per siswa/bulan",
      icon: PieChartIcon,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Harga per Item",
      value: formatCurrency(stats.pricePerItem),
      icon: SettingsIcon,
      iconBg: "bg-slate-100 dark:bg-slate-900/30",
      iconColor: "text-slate-600 dark:text-slate-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {cards.map(({ label, value, sub, icon: Icon, iconBg, iconColor }) => (
        <div
          key={label}
          className="flex min-h-[120px] flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] sm:min-h-[128px]"
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${iconBg}`}
          >
            <Icon className={`size-5 sm:size-6 ${iconColor}`} />
          </div>
          <div className="mt-4 min-w-0 flex-1 pb-0.5">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 sm:text-sm">
              {label}
            </span>
            <p className="mt-1.5 break-words font-semibold leading-snug text-gray-800 dark:text-white/90 sm:text-base">
              {value}
            </p>
            {sub && (
              <p className="mt-1 text-xs leading-normal text-gray-400 dark:text-gray-500">
                {sub}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
