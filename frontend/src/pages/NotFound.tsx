import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="mb-4 text-8xl font-light text-foreground">404</h1>
        <p className="mb-8 text-xl text-foreground/60 font-light">Page not found</p>
        <Link to="/">
          <Button variant="neumorphic" size="lg">
            Return Home
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
