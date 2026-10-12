import { Builder } from "@/components/builder/builder"

export default async function FormPage({ params, searchParams }: PageProps<"/forms/[id]">) {
  const { id } = await params
  const { v } = await searchParams
  return <Builder key={`${id}-${typeof v === "string" ? v : ""}`} formId={id} versionId={typeof v === "string" ? v : undefined} />
}
