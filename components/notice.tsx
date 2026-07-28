export function Notice({ searchParams }:{ searchParams:Record<string,string|string[]|undefined> }) {
  const error=Array.isArray(searchParams.error)?searchParams.error[0]:searchParams.error;
  const success=Array.isArray(searchParams.success)?searchParams.success[0]:searchParams.success;
  return <>{error&&<p className="error" role="alert">{error}</p>}{success&&<p className="success">{success}</p>}</>;
}
