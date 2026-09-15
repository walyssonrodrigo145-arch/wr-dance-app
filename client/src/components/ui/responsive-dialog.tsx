import * as React from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface ResponsiveDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title?: string;
  description?: string;
}

export function ResponsiveDialog({
  children,
  open,
  onOpenChange,
  trigger,
  title,
  description,
}: ResponsiveDialogProps) {
  const { isMobile } = useBreakpoint();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent className="px-4 pb-8">
          <DrawerHeader className="text-left px-0">
            {title && <DrawerTitle>{title}</DrawerTitle>}
            {description && (
              <DrawerDescription>{description}</DrawerDescription>
            )}
          </DrawerHeader>
          <div className="py-4 overflow-y-auto overflow-x-hidden max-h-[90dvh] scrollbar-none">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {(title || description) && (
          <DialogHeader className="p-6 pb-2">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
        )}
        <div className="overflow-y-auto overflow-x-hidden flex-1 max-h-[calc(90vh-80px)] px-6 pb-6 subtle-scrollbar">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export {
  DialogHeader as ResponsiveDialogHeader,
  DialogTitle as ResponsiveDialogTitle,
  DialogDescription as ResponsiveDialogDescription,
  DialogFooter as ResponsiveDialogFooter,
};
