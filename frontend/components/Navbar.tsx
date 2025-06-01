"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  // Moon, 
  // Sun, 
  Menu,
  X
} from "lucide-react"
import { useTheme } from "@/context/ThemeContext"
import { useConnect, useConnectors } from 'wagmi'


interface NavbarProps {
  activeTab?: string
  onTabChange?: (tab: string) => void
}

export default function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const connect = useConnect()
  const connectors = useConnectors()

  const { isDark } = useTheme()

  const tabs = [
    { id: "mcps", label: "MCPs", href: "/" },
    { id: "register", label: "Register", href: "/register" },
  ]

  const handleTabChange = (tabId: string) => {
    if (onTabChange) {
      onTabChange(tabId)
    }
  }

  return (
    <nav
      className={`sticky top-0 z-40 w-full border-b transition-colors duration-200 ${isDark ? "bg-black/95 backdrop-blur border-gray-800" : "bg-white/95 backdrop-blur border-gray-200"
        }`}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>MCPay</h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  asChild
                  onClick={() => tab.id !== "register" && tab.id !== "mcps" && handleTabChange(tab.id)}
                  className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${activeTab === tab.id
                    ? isDark
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-900"
                    : isDark
                      ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                >
                  <Link href={tab.href || "#"}>{tab.label}</Link>
                </Button>
              ))}
            </div>
          </div>

          {/* Desktop Theme Toggle */}
          {/* <div className="hidden md:block">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className={`flex items-center gap-2 ${
                isDark ? "text-gray-300 hover:bg-gray-800" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden lg:inline">{isDark ? "Light" : "Dark"}</span>
            </Button>
          </div> */}
          <div> {
            connectors?.filter((connector) => connector.name == "MetaMask").map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect.connect({ connector })}
              >
                {connector.name == "MetaMask" ? 'Connected' : 'Connect'}
              </button>
            ))
          }</div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={isDark ? "text-gray-300 hover:bg-gray-800" : "text-gray-600 hover:bg-gray-100"}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-gray-200 dark:border-gray-700">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant="ghost"
                  asChild
                  onClick={() => {
                    if (tab.id !== "register" && tab.id !== "mcps") {
                      handleTabChange(tab.id)
                    }
                    setIsMobileMenuOpen(false)
                  }}
                  className={`w-full justify-start px-3 py-2 text-sm font-medium transition-colors duration-200 ${activeTab === tab.id
                    ? isDark
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-900"
                    : isDark
                      ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                >
                  <Link href={tab.href || "#"}>{tab.label}</Link>
                </Button>
              ))}

              {/* Mobile Theme Toggle */}
              {/* <Button
                variant="ghost"
                onClick={() => {
                  toggleTheme()
                  setIsMobileMenuOpen(false)
                }}
                className={`w-full justify-start px-3 py-2 text-sm font-medium flex items-center gap-2 ${
                  isDark ? "text-gray-300 hover:bg-gray-800" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDark ? "Light Mode" : "Dark Mode"}
              </Button> */}
              <div>
                {
                  connectors?.filter((connector) => connector.name == "MetaMask").map((connector) => (


                    <button

                      key={connector.uid}
                      onClick={() => connect.connect({ connector })}
                    >
                      {connector.name == "MetaMask" ? 'Connected' : 'Connect'}
                    </button>
                  ))
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
