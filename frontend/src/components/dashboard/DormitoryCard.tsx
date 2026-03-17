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
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-5 md:p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700 sm:h-6 sm:w-48" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800 sm:h-12" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
          Siswa per Asrama
        </h3>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 sm:text-lg">
            Siswa per Asrama
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
            Siswa aktif per asrama ({total} total)
          </p>
        </div>
        <Link
          to="/students"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
        >
          Lihat semua
          <AngleRightIcon className="size-4" />
        </Link>
      </div>

      <div className="mt-5 space-y-4 sm:mt-6 sm:space-y-5">
        {stats.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Belum ada data asrama
          </p>
        ) : (
          stats.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 sm:h-9 sm:w-9">
                  <GroupIcon className="size-4 text-gray-600 dark:text-gray-400 sm:size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800 text-sm dark:text-white/90">
                    {item.name}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.count} siswa
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:max-w-[140px] sm:gap-3">
                <div className="relative h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800 sm:w-24">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-medium text-gray-800 dark:text-white/90 sm:w-10">
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
