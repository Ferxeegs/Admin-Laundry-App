import DashboardMetrics from "../../components/dashboard/DashboardMetrics";
import OrderChart from "../../components/dashboard/OrderChart";
import OrderStatusPieChart from "../../components/dashboard/OrderStatusPieChart";
import MonthlyTargetCard from "../../components/dashboard/MonthlyTargetCard";
import RecentOrdersTable from "../../components/dashboard/RecentOrdersTable";
import DormitoryCard from "../../components/dashboard/DormitoryCard";
import PageMeta from "../../components/common/PageMeta";

export default function Home() {
  return (
    <>
      <PageMeta
        title="Dashboard"
        description="Ringkasan operasional laundry pondok: siswa, order, pendapatan, dan statistik per asrama."
      />
      <div className="space-y-5 sm:space-y-6 lg:space-y-8">
        
        {/* Welcome Section */}
        <section aria-label="Welcome" className="mb-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">Dashboard</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 sm:text-base">Ringkasan operasional laundry, statistik order, dan metrik pendapatan harian.</p>
        </section>

        {/* Ringkasan */}
        <section aria-label="Ringkasan">
          <DashboardMetrics />
        </section>

        {/* Chart bulanan + Realisasi */}
        <section
          className="grid grid-cols-1 gap-6 xl:grid-cols-12"
          aria-label="Grafik bulanan"
        >
          <div className="xl:col-span-8">
            <OrderChart />
          </div>
          <div className="xl:col-span-4">
            <MonthlyTargetCard />
          </div>
        </section>

        {/* Order dalam proses (pie) */}
        <section
          className="grid grid-cols-1 gap-6 xl:grid-cols-12"
          aria-label="Order dalam proses"
        >
          <div className="xl:col-span-5">
            <OrderStatusPieChart />
          </div>
          <div className="xl:col-span-7">
            <RecentOrdersTable />
          </div>
        </section>

        {/* Siswa per asrama */}
        <section aria-label="Siswa per asrama">
          <DormitoryCard />
        </section>
      </div>
    </>
  );
}
