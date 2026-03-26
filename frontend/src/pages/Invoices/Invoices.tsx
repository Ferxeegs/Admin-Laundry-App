import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import InvoicesListOptimized from "./InvoicesListOptimized";

export default function Invoices() {
  return (
    <>
      <PageMeta title="Invoice" description="Mengelola invoice tagihan bulanan" />
      <PageBreadcrumb pageTitle="Invoice" />
      <div className="space-y-6">
        <ComponentCard title="Manajemen Invoice" desc="Tagihan bulanan per siswa">
          <InvoicesListOptimized />
        </ComponentCard>
      </div>
    </>
  );
}

