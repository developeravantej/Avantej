import {
  ChevronRight,
  Folder,
  Forward,
  MoreHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "@tanstack/react-router";

export function NavProjects({
  projects,
}: {
  projects: {
    name: string;
    url: string;
    icon: LucideIcon;
    isActive?: boolean;
    items?: {
      name: string;
      url: string;
      icon?: LucideIcon;
    }[];
  }[];
}) {
  const { state, setOpen } = useSidebar();
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const handleMenuClick = (itemName: string, hasItems: boolean) => {
    if (hasItems) {
      // If sidebar is collapsed and item has subitems, expand sidebar first
      if (state === "collapsed") {
        setOpen(true);
        // Wait a bit for the sidebar to expand, then open the collapsible
        setTimeout(() => {
          setOpenItems(prev => ({ ...prev, [itemName]: true }));
        }, 150);
      } else {
        // If sidebar is already expanded, just toggle the collapsible
        setOpenItems(prev => ({ ...prev, [itemName]: !prev[itemName] }));
      }
    }
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((item) => {
          const hasItems = Boolean(item.items && item.items.length > 0);
          const isOpen = openItems[item.name] || item.isActive;

          return (
            <Collapsible
              key={item.name}
              asChild
              open={isOpen}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                {hasItems ? (
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton 
                      tooltip={item.name}
                      onClick={() => handleMenuClick(item.name, hasItems)}
                    >
                      <item.icon />
                      <span className="group-data-[state=collapsed]:hidden">
                        {item.name}
                      </span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                ) : (
                  <SidebarMenuButton asChild tooltip={item.name}>
                    <Link to={item.url}>
                      <item.icon />
                      <span className="group-data-[state=collapsed]:hidden">
                        {item.name}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                )}
                {hasItems && item.items && (
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.name}>
                          <SidebarMenuSubButton asChild>
                            <Link to={subItem.url}>
                              {subItem.icon && <subItem.icon />}
                              <span>{subItem.name}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                )}
                {/* <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontal />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-48 rounded-lg"
                    side={"right"}
                    align={"start"}
                  >
                    <DropdownMenuItem>
                      <Folder className="text-muted-foreground" />
                      <span>View Project</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Forward className="text-muted-foreground" />
                      <span>Share Project</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Trash2 className="text-muted-foreground" />
                      <span>Delete Project</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu> */}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}





