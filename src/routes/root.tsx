import { Outlet } from "react-router";

/**
 * root layout shared by every route
 */
export default function Root() {
  return (
    <main className="container">
      <Outlet />
    </main>
  );
}
