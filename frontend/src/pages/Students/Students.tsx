import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import StudentsList from "./StudentsList";

export default function Students() {
  return (
    <>
      <PageMeta
        title="Siswa"
        description="Mengelola semua siswa dalam sistem"
      />
      <PageBreadcrumb pageTitle="Siswa" />
      <div className="space-y-6">
        <ComponentCard title="Daftar Siswa">
          <StudentsList />
        </ComponentCard>
      </div>
    </>
  );
}

