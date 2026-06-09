import { ProjectSidebar } from '@/components/ProjectSidebar';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <>
      <ProjectSidebar slug={slug} />
      <main className="flex-1 overflow-auto">{children}</main>
    </>
  );
}
