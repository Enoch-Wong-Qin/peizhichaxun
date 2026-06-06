import { Outlet } from "react-router-dom";
import { Database } from "lucide-react";

const Layout = () => {
  return (
    <div className="w-screen min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-6 flex items-center h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold text-foreground tracking-tight">
              车型配置数据查询
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
