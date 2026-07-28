import { AuthForm } from "@/components/auth-form";
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <AuthForm mode="login" params={await searchParams}/>; }
