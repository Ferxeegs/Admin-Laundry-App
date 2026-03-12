import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import ComponentCard from "../../components/common/ComponentCard";
import PageMeta from "../../components/common/PageMeta";
import StudentsList from "./StudentsList";

export default function Students() {
  return (
    <>
      <PageMeta
        title="Students"
        description="Manage all students in the system"
      />
      <PageBreadcrumb pageTitle="Students" />
      <div className="space-y-6">
        <ComponentCard title="Daftar Students">
          <StudentsList />
        </ComponentCard>
      </div>
    </>
  );
}

