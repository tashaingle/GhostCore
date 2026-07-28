import { AuthForm } from "@/components/auth-form";
export default async function Register({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <AuthForm mode="register" params={await searchParams}/>; }
