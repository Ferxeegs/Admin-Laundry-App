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
    dailyQuota: number;
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
        const dailyQuota =
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
          dailyQuota,
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
        <div className="col-span-2 sm:col-span-1 rounded-2xl bg-gray-200/50 p-5 dark:bg-gray-800/30 animate-pulse sm:p-6 h-[140px]" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="col-span-1 rounded-2xl border border-gray-100 bg-white p-5 dark:border-gray-800/50 dark:bg-white/[0.02] animate-pulse sm:p-6 h-[140px]"
          >
            <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-gray-700 sm:h-12 sm:w-12" />
            <div className="mt-6 h-6 w-16 rounded bg-gray-200 dark:bg-gray-700 sm:mt-8" />
            <div className="mt-2 h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
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
      label: "Kuota Gratis Harian",
      value: `${stats.dailyQuota} item`,
      sub: "per siswa/hari",
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
      {/* Primary Card - Total Siswa (Spans full width on mobile) */}
      <div className="col-span-2 sm:col-span-1 flex min-h-[120px] sm:min-h-[140px] flex-col rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 sm:p-6 shadow-md shadow-brand-500/20 relative overflow-hidden group">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl transition-transform group-hover:scale-110" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-brand-400/20 blur-3xl" />
        
        <div className="relative flex items-start justify-between">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm text-white">
            <GroupIcon className="size-5 sm:size-6" />
          </div>
        </div>
        
        <div className="relative mt-auto pt-4">
          <p className="text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl">
            {stats.totalStudents.toLocaleString("id-ID")}
          </p>
          <span className="mt-1 block text-sm font-medium text-brand-100/90 sm:text-base">
            Total Siswa Aktif
          </span>
        </div>
      </div>

      {/* Secondary Cards */}
      {cards.slice(1).map(({ label, value, sub, icon: Icon, iconBg, iconColor }) => (
        <div
          key={label}
          className="col-span-1 flex min-h-[120px] sm:min-h-[140px] flex-col rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm shadow-gray-200/50 dark:border-gray-800/60 dark:bg-white/[0.02] dark:shadow-none hover:shadow-md transition-shadow"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${iconBg}`}
          >
            <Icon className={`size-5 sm:size-6 ${iconColor}`} />
          </div>
          <div className="mt-auto pt-4 min-w-0 flex-1 flex flex-col justify-end">
            <p className="break-words text-lg sm:text-2xl font-bold leading-none tracking-tight text-gray-900 dark:text-white/95">
              {value}
            </p>
            <span className="mt-1 block text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">
              {label}
            </span>
            {sub && (
              <p className="mt-0.5 text-[10px] sm:text-xs leading-none text-gray-400 dark:text-gray-500">
                {sub}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
