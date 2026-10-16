import { ProfileView } from '@/components/profile';
export default async function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  return <ProfileView key={`${type}:${id}`} type={type} id={id} />;
}
