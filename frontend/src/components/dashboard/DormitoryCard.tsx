import { useEffect, useState } from "react";
import { Link } from "react-router";
import { studentAPI } from "../../utils/api";
import { GroupIcon, AngleRightIcon } from "../../icons";

interface DormitoryStat {
  name: string;
  count: number;
  percentage: number;
}

export default function DormitoryCard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DormitoryStat[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const limit = 100;

    async function fetchStudents() {
      setLoading(true);
      setError(null);
      try {
        const allStudents: Array<{ dormitory: string | null }> = [];
        let page = 1;
        let totalPages = 1;

        do {
          const res = await studentAPI.getAllStudents({
            page,
            limit,
            is_active: true,
          });
          if (cancelled) return;
          if (!res.success || !res.data?.students) {
            setError(res.message || "Gagal memuat data siswa");
            return;
          }
          allStudents.push(...res.data.students);
          totalPages = res.data.pagination?.totalPages ?? 1;
          page += 1;
        } while (page <= totalPages && !cancelled);

        const byDorm: Record<string, number> = {};
        for (const s of allStudents) {
          const key = s.dormitory?.trim() || "Tanpa asrama";
          byDorm[key] = (byDorm[key] || 0) + 1;
        }
        const totalCount = allStudents.length;
        const list: DormitoryStat[] = Object.entries(byDorm)
          .map(([name, count]) => ({
            name,
            count,
            percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6);
        setStats(list);
        setTotal(totalCount);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStudents();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-white/[0.02] sm:p-5 md:p-6 shadow-sm shadow-gray-200/50">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700 sm:h-6 sm:w-48" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/50 sm:h-12" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-white/[0.02] sm:p-6 shadow-sm shadow-gray-200/50">
        <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white/95 sm:text-lg">
          Siswa per Asrama
        </h3>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm shadow-gray-200/50 dark:border-gray-800/60 dark:bg-white/[0.02] dark:shadow-none hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-gray-900 dark:text-white/95 sm:text-lg">
            Siswa per Asrama
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Total {total} siswa terdaftar
          </p>
        </div>
        <Link
          to="/students"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/80 transition-colors"
        >
          Lihat semua
          <AngleRightIcon className="size-4 text-gray-400" />
        </Link>
      </div>

      <div className="mt-6 space-y-4 sm:space-y-5">
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6">
            <div className="mb-3 rounded-full bg-gray-50 p-3 dark:bg-gray-800/50">
              <GroupIcon className="size-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Belum ada data asrama
            </p>
          </div>
        ) : (
          stats.map((item) => (
            <div
              key={item.name}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors -mx-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 transition-colors group-hover:bg-brand-100 dark:group-hover:bg-brand-500/20">
                  <GroupIcon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900 text-sm dark:text-white/95">
                    {item.name}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.count} siswa
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:max-w-[200px] w-full sm:w-auto">
                <div className="relative h-2 w-full sm:w-28 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 dark:from-brand-500 dark:to-brand-400 transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-bold text-gray-700 dark:text-gray-300">
                  {item.percentage}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
