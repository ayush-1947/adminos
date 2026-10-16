import { ModulePage } from '@/components/module-page';
export default async function Page({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return <ModulePage moduleKey={module} />;
}
