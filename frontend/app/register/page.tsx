"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textArea"
import { Badge } from "@/components/ui/badge"
import { Plus, Server, Globe, CheckCircle, Trash2, DollarSign } from "lucide-react"

interface Tool {
  id: string
  name: string
  description: string
  price: string
}

interface RegisterTabProps {
  isDark: boolean
}

export default function RegisterTab({ isDark }: RegisterTabProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    url: "",
    headers: "",
    walletAddress: "",
    category: "",
  })

  const [tools, setTools] = useState<Tool[]>([{ id: "1", name: "", description: "", price: "" }])

  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Filter out empty tools
    const validTools = tools.filter((tool) => tool.name.trim() !== "")

    const submissionData = {
      ...formData,
      tools: validTools,
    }

    console.log("Submitting MCP server:", submissionData)
    setIsSubmitted(true)

    // Reset form after 3 seconds
    setTimeout(() => {
      setIsSubmitted(false)
      setFormData({
        name: "",
        description: "",
        url: "",
        headers: "",
        walletAddress: "",
        category: "",
      })
      setTools([{ id: "1", name: "", description: "", price: "" }])
    }, 3000)
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const addTool = () => {
    const newTool: Tool = {
      id: Date.now().toString(),
      name: "",
      description: "",
      price: "",
    }
    setTools([...tools, newTool])
  }

  const removeTool = (id: string) => {
    if (tools.length > 1) {
      setTools(tools.filter((tool) => tool.id !== id))
    }
  }

  const updateTool = (id: string, field: keyof Omit<Tool, "id">, value: string) => {
    setTools(tools.map((tool) => (tool.id === id ? { ...tool, [field]: value } : tool)))
  }

  const categories = ["Automation", "Database", "Development", "Productivity", "Utilities", "Communication", "AI/ML"]

  const isFormValid =
    formData.name && formData.description && formData.url && formData.category && formData.walletAddress

  if (isSubmitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className={`${isDark ? "bg-gray-800 border-gray-700" : ""}`}>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <CheckCircle className={`h-16 w-16 mx-auto ${isDark ? "text-green-400" : "text-green-600"}`} />
              <h3 className="text-xl font-semibold">MCP Server Registered!</h3>
              <p className={`${isDark ? "text-gray-300" : "text-gray-600"}`}>
                Thank you for contributing to the MCP ecosystem. Your server will be reviewed and added to the directory
                soon. Payment processing will be handled through your provided wallet address.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Server className={`h-8 w-8 ${isDark ? "text-gray-300" : "text-gray-600"}`} />
          <h2 className="text-3xl font-bold">Register MCP Server</h2>
        </div>
        <p className={`text-lg ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          Share your Model Context Protocol server with the community and monetize your tools
        </p>
      </div>

      {/* Registration Form */}
      <Card className={`${isDark ? "bg-gray-800 border-gray-700" : ""}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Server Information
          </CardTitle>
          <CardDescription className={isDark ? "text-gray-400" : ""}>
            Provide details about your MCP server to help others discover and use it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Server Name */}
            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Server Name *
              </label>
              <Input
                placeholder="e.g., My Awesome MCP Server"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                required
                className={isDark ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400" : ""}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Description *
              </label>
              <Textarea
                placeholder="Describe what your MCP server does and its key features..."
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                required
                rows={3}
                className={isDark ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400" : ""}
              />
            </div>

            {/* Server URL */}
            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                MCP Server URL *
              </label>
              <Input
                placeholder="https://your-server.com/mcp/•••••••/sse"
                value={formData.url}
                onChange={(e) => handleInputChange("url", e.target.value)}
                required
                type="url"
                className={isDark ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400" : ""}
              />
            </div>

            {/* Headers */}
            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>Headers</label>
              <Textarea
                placeholder="Authorization: Bearer token&#10;Content-Type: application/json&#10;X-API-Key: your-api-key"
                value={formData.headers}
                onChange={(e) => handleInputChange("headers", e.target.value)}
                rows={3}
                className={isDark ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400" : ""}
              />
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                Optional: Add any required headers for your server (one per line)
              </p>
            </div>

            {/* Wallet Address */}
            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Wallet Address *
              </label>
              <Input
                placeholder="0x1234567890abcdef1234567890abcdef12345678"
                value={formData.walletAddress}
                onChange={(e) => handleInputChange("walletAddress", e.target.value)}
                required
                className={isDark ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400" : ""}
              />
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                Ethereum wallet address for receiving payments from tool usage
              </p>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>Category *</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Badge
                    key={category}
                    variant={formData.category === category ? "default" : "outline"}
                    className={`cursor-pointer transition-colors ${
                      isDark
                        ? formData.category === category
                          ? "bg-gray-700 text-white"
                          : "border-gray-500 text-gray-300 hover:bg-gray-700"
                        : formData.category === category
                          ? "bg-gray-900 text-white"
                          : ""
                    }`}
                    onClick={() => handleInputChange("category", category)}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Tools Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  Available Tools
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTool}
                  className={`flex items-center gap-2 ${
                    isDark ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600" : ""
                  }`}
                >
                  <Plus className="h-4 w-4" />
                  Add Tool
                </Button>
              </div>

              <div className="space-y-4">
                {tools.map((tool, index) => (
                  <Card
                    key={tool.id}
                    className={`${isDark ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"}`}
                  >
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className={`font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                            Tool #{index + 1}
                          </h4>
                          {tools.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTool(tool.id)}
                              className={`text-red-500 hover:text-red-700 ${
                                isDark ? "hover:bg-gray-600" : "hover:bg-red-50"
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                              Tool Name
                            </label>
                            <Input
                              placeholder="e.g., send_email"
                              value={tool.name}
                              onChange={(e) => updateTool(tool.id, "name", e.target.value)}
                              className={`text-sm ${
                                isDark ? "bg-gray-600 border-gray-500 text-white placeholder:text-gray-400" : ""
                              }`}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                              Price (USD)
                            </label>
                            <div className="relative">
                              <DollarSign
                                className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 ${
                                  isDark ? "text-gray-400" : "text-gray-500"
                                }`}
                              />
                              <Input
                                placeholder="0.10"
                                value={tool.price}
                                onChange={(e) => updateTool(tool.id, "price", e.target.value)}
                                type="number"
                                step="0.01"
                                min="0"
                                className={`pl-10 text-sm ${
                                  isDark ? "bg-gray-600 border-gray-500 text-white placeholder:text-gray-400" : ""
                                }`}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            Description
                          </label>
                          <Textarea
                            placeholder="Describe what this tool does..."
                            value={tool.description}
                            onChange={(e) => updateTool(tool.id, "description", e.target.value)}
                            rows={2}
                            className={`text-sm ${
                              isDark ? "bg-gray-600 border-gray-500 text-white placeholder:text-gray-400" : ""
                            }`}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className={`w-full ${
                isDark ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-900 text-white hover:bg-gray-800"
              }`}
              disabled={!isFormValid}
            >
              <Globe className="h-4 w-4 mr-2" />
              Register MCP Server
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className={`${isDark ? "bg-gray-800 border-gray-700" : ""}`}>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <h4 className="font-medium">What happens next?</h4>
            <ul className={`space-y-2 text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
              <li>• Your submission will be reviewed by our team</li>
              <li>• We will verify the server URL and functionality</li>
              <li>• Tool pricing will be validated and payment processing set up</li>
              <li>• Once approved, it will appear in the MCP directory</li>
              <li>• Users will pay per tool usage to your wallet address</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
