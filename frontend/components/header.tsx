"use client";
import { useScroll } from "@/hooks/use-scroll";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { MobileNav } from "@/components/mobile-nav";
import { useRouter } from "next/navigation";

export const navLinks = [];

export function Header() {
	const router 	= useRouter()
	const scrolled = useScroll(10);

	return (
		<header
			className={cn("sticky top-0 z-50 w-full border-transparent border-b", {
				"border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50":
					scrolled,
			})}
		>
			<nav className="flex h-14 items-center justify-between px-4">
				<Logo className="cursor-pointer" />
				<div className="hidden items-center gap-1 md:flex">
					<ThemeToggle />
					<Button variant={'ghost'} className="cursor-pointer font-medium" onClick={()=>{
						router.push('/login')
					}}>Sign In</Button>
					<Button className="cursor-pointer bg-brand font-medium text-brand-foreground hover:bg-brand/90" onClick={()=>{
						router.push('/register')
					}}>Get Started</Button>
				</div>
				<MobileNav />
			</nav>
		</header>
	);
}
