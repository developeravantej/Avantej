import {
  AudioWaveform,
  BadgeDollarSign,
  BookUser,
  Calendar,
  Cog,
  Command,
  DollarSign,
  Eye,
  FileChartColumnIncreasing,
  GalleryVerticalEnd,
  Home,
  Mail,
  Map,
  PackageSearch,
  PieChart,
  Plus,
  Search,
  Settings2,
  Shield,
  Store,
  Users,
  UserPlus,
  Warehouse,
} from 'lucide-react';
import type * as React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { NavMain } from './nav-main';
import { NavProjects } from './nav-projects';

export type SidebarMenuItem = {
  title: string;
  url: string;
  icon?: React.ComponentType<any>;
  isActive?: boolean;
  items?: SidebarMenuItem[];
};

// This is sample data.
export const SIDEBAR_DATA = {
  user: {
    name: 'Way Sern',
    email: 'm@example.com',
    avatar: 'https://github.com/shadcn.png',
  },
  teams: [
    {
      name: 'Avantej Core',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'MoveFitness',
      logo: AudioWaveform,
      plan: 'Startup',
    },
    {
      name: 'Genius Corp.',
      logo: Command,
      plan: 'Free',
    },
  ],
  navMain: [
    {
      title: 'Branches',
      url: '#',
      icon: Settings2,
      isActive: false,

      items: [
        {
          title: 'View Branches',
          url: '/dashboard/branch/view',
        },
      ],
    },
    {
      title: 'Services',
      url: '#',
      icon: Settings2,
      isActive: false,

      items: [
        {
          title: 'View Services Categories',
          url: '/dashboard/service-category/view',
        },
        {
          title: 'View Service',
          url: '/dashboard/service/view',
        },
      ],
    },
    {
      title: 'User',
      url: '#',
      icon: Settings2,
      isActive: false,
      items: [
        {
          title: 'User Roles',
          url: '/dashboard/role/view',
        },
        {
          title: 'User Position',
          url: '/dashboard/role/view',
        },
        {
          title: 'Commission & Incentives',
          url: '/dashboard/role/view',
        },
        {
          title: 'Employees Listing',
          url: '/dashboard/user/view',
        },
      ],
    },
    {
      title: 'Sales',
      url: '#',
      icon: Settings2,
      isActive: false,

      items: [
        {
          title: 'Daily Transaction Summary',
          url: '#',
        },
        {
          title: 'Cash Summary',
          url: '#',
        },
        {
          title: 'Sales',
          url: '#',
        },
        {
          title: 'Payment',
          url: '#',
        },
        {
          title: 'Cancelled Sales',
          url: '#',
        },
      ],
    },
    {
      title: 'Inventory',
      url: '#',
      icon: Settings2,
      isActive: false,
      items: [
        {
          title: 'Products',
          url: '#',
        },
        {
          title: 'Brands',
          url: '#',
        },
        {
          title: 'Categories',
          url: '#',
        },
        {
          title: 'Suppliers',
          url: '#',
        },
        {
          title: 'UoM Conversion',
          url: '#',
        },
        {
          title: 'Stock Request',
          url: '#',
        },
        {
          title: 'Transfer Orders',
          url: '#',
        },
      ],
    },
    {
      title: 'Reports',
      url: '#',
      icon: Settings2,
      isActive: false,
      items: [
        {
          title: '...',
          url: '#',
        },
      ],
    },
    {
      title: 'Config',
      url: '#',
      icon: Settings2,
      isActive: false,
      items: [
        {
          title: '...',
          url: '#',
        },
      ],
    },
  ],

  projects: [
    {
      name: 'Home',
      url: '/dashboard',
      icon: Home,
    },
    {
      name: 'Appointments',
      url: '/dashboard/appointment/view',
      icon: Calendar,
    },
    {
      name: 'Customers',
      url: '/customers',
      icon: BookUser,
    },
    {
      name: 'GHL Integration',
      url: '/go-highlevel-integration',
      icon: Map,
    },
    {
      name: 'Branches',
      url: '#',
      icon: Store,
      isActive: false,
      items: [
        {
          name: 'View Branches',
          url: '/dashboard/branch/view',
          icon: Eye,
        },
        {
          name: 'Create Branch',
          url: '/dashboard/branch/create',
          icon: Plus,
        },
      ],
    },
    {
      name: 'Services',
      url: '#',
      icon: PackageSearch,
      isActive: false,

      items: [
        {
          name: 'View Services Categories',
          url: '/service-category/view',
        },
        {
          name: 'View Service',
          url: '/service/view',
        },
      ],
    },
    {
      name: 'Access Control',
      url: '#',
      icon: Shield,
      isActive: false,
      items: [
        {
          name: 'Role Management',
          url: '/dashboard/access-control/roles',
          icon: Shield,
        },
        {
          name: 'Permissions',
          url: '/dashboard/access-control/permissions',
          icon: Settings2,
        },
        {
          name: 'User Assignment',
          url: '/dashboard/access-control/user-assignment',
          icon: UserPlus,
        },
        {
          name: 'Invitations',
          url: '/dashboard/access-control/invitations',
          icon: Mail,
        },
      ],
    },
    {
      name: 'User',
      url: '#',
      icon: Users,
      isActive: false,
      items: [
        {
          name: 'User Roles',
          url: '/dashboard/access-control/roles',
        },
        {
          name: 'User Position',
          url: '/dashboard/role/view',
        },
        {
          name: 'Commission & Incentives',
          url: '/dashboard/role/view',
        },
        {
          name: 'Employees Listing',
          url: '/dashboard/user/view',
        },
      ],
    },
    {
      name: 'Sales',
      url: '#',
      icon: BadgeDollarSign,
      isActive: false,

      items: [
        {
          name: 'Daily Transaction Summary',
          url: '#',
        },
        {
          name: 'Cash Summary',
          url: '#',
        },
        {
          name: 'Sales',
          url: '#',
        },
        {
          name: 'Payment',
          url: '#',
        },
        {
          name: 'Cancelled Sales',
          url: '#',
        },
      ],
    },
    {
      name: 'Inventory',
      url: '#',
      icon: Warehouse,
      isActive: false,
      items: [
        {
          name: 'Products',
          url: '#',
        },
        {
          name: 'Brands',
          url: '#',
        },
        {
          name: 'Categories',
          url: '#',
        },
        {
          name: 'Suppliers',
          url: '#',
        },
        {
          name: 'UoM Conversion',
          url: '#',
        },
        {
          name: 'Stock Request',
          url: '#',
        },
        {
          name: 'Transfer Orders',
          url: '#',
        },
      ],
    },
    {
      name: 'Reports',
      url: '#',
      icon: FileChartColumnIncreasing,
      isActive: false,
      items: [
        {
          name: '...',
          url: '#',
        },
      ],
    },
    {
      name: 'Config',
      url: '#',
      icon: Cog,
      isActive: false,
      items: [
        {
          name: '...',
          url: '#',
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2">
          <img
            alt="Logo"
            className="h-8 w-auto group-data-[collapsible=icon]:hidden"
            src="/logo_only.png"
          />
          <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-bold font-heading text-2xl leading-none">
              avantej
            </span>
            <span className="-mt-1 font-bold font-heading text-2xl leading-none">
              core
            </span>
          </div>
          <div className="ml-auto py-2 font-bold text-2xl italic group-data-[collapsible=icon]:hidden" />
          <SidebarTrigger className="pr-2" />
        </div>
      </SidebarHeader>
      <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
        <div className="relative w-full">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 transform text-gray-400" />
          <input
            className="w-full rounded-md border border-gray-300 py-2 pr-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Power Search..."
            type="text"
          />
        </div>
      </div>
      <SidebarContent>
        <NavProjects projects={SIDEBAR_DATA.projects} />
        {/* <div className="group-data-[collapsible=icon]:hidden">
          <NavMain items={SIDEBAR_DATA.navMain} />
        </div> */}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}




