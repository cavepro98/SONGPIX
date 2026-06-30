import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      expand
      visibleToasts={4}
      duration={3500}
      className="toaster group"
      icons={{}}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-full group-[.toaster]:border group-[.toaster]:backdrop-blur-md group-[.toaster]:font-sans group-[.toaster]:text-sm group-[.toaster]:px-5 group-[.toaster]:py-3 group-[.toaster]:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]",
          title: "group-[.toast]:font-medium group-[.toast]:text-sm",
          description: "group-[.toast]:text-sm group-[.toast]:font-medium",
          success:
            "group-[.toaster]:!bg-emerald-500/15 group-[.toaster]:!border-emerald-500/40 group-[.toaster]:!text-emerald-300 [&_svg]:!text-emerald-300",
          error:
            "group-[.toaster]:!bg-destructive/15 group-[.toaster]:!border-destructive/50 group-[.toaster]:!text-destructive [&_svg]:!text-destructive",
          info: "group-[.toaster]:!bg-sky-500/15 group-[.toaster]:!border-sky-500/40 group-[.toaster]:!text-sky-300 [&_svg]:!text-sky-300",
          warning:
            "group-[.toaster]:!bg-yellow-500/15 group-[.toaster]:!border-yellow-500/40 group-[.toaster]:!text-yellow-300 [&_svg]:!text-yellow-300",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
