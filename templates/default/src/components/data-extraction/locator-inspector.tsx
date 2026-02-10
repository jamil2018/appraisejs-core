'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Target, MousePointer, Info } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface SelectedElementDetails {
  tag: string
  id?: string
  className?: string
  name?: string
  text?: string
  cssPath: string
  xpath: string
  html: string
}

interface LocatorInspectorProps {
  iframeUrl?: string
}

export default function LocatorInspector({ iframeUrl = '/sample-page' }: LocatorInspectorProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedElementDetails, setSelectedElementDetails] = useState<SelectedElementDetails | undefined>()
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Injection script - optimized and cleaned up
  const injectionScript = `
    (function() {
      if (window.locatorInspectorInjected) return;
      window.locatorInspectorInjected = true;
      
      let isSelectionMode = false;
      let hoveredElement = null;
      
      // Inject CSS for hover effects
      const style = document.createElement('style');
      style.textContent = \`
        .locator-inspector-hover {
          outline: 2px solid #3b82f6 !important;
          background-color: rgba(59, 130, 246, 0.1) !important;
          cursor: crosshair !important;
        }
        .locator-inspector-selection-mode * {
          cursor: crosshair !important;
        }
      \`;
      document.head.appendChild(style);
      
      function handleElementClick(event) {
        if (!isSelectionMode) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const target = event.target;
        
        // Send element data to parent
        window.parent.postMessage({
          type: 'ELEMENT_SELECTED',
          elementData: {
            tagName: target.tagName,
            id: target.id,
            className: target.className,
            name: target.name,
            textContent: target.textContent?.trim(),
            outerHTML: target.outerHTML,
          }
        }, '*');
        
        exitSelectionMode();
      }
      
      function handleElementHover(event) {
        if (!isSelectionMode) return;
        
        if (hoveredElement) {
          hoveredElement.classList.remove('locator-inspector-hover');
        }
        
        hoveredElement = event.target;
        hoveredElement.classList.add('locator-inspector-hover');
      }
      
      function handleElementLeave(event) {
        if (!isSelectionMode) return;
        event.target.classList.remove('locator-inspector-hover');
      }
      
      function enterSelectionMode() {
        isSelectionMode = true;
        document.body.classList.add('locator-inspector-selection-mode');
        document.addEventListener('click', handleElementClick, true);
        document.addEventListener('mouseover', handleElementHover, true);
        document.addEventListener('mouseout', handleElementLeave, true);
      }
      
      function exitSelectionMode() {
        isSelectionMode = false;
        document.body.classList.remove('locator-inspector-selection-mode');
        document.removeEventListener('click', handleElementClick, true);
        document.removeEventListener('mouseover', handleElementHover, true);
        document.removeEventListener('mouseout', handleElementLeave, true);
        
        // Clean up hover effects
        document.querySelectorAll('.locator-inspector-hover').forEach(el => {
          el.classList.remove('locator-inspector-hover');
        });
        
        hoveredElement = null;
        
        window.parent.postMessage({ type: 'SELECTION_MODE_OFF' }, '*');
      }
      
      // Listen for toggle messages
      window.addEventListener('message', function(event) {
        if (event.data.type === 'TOGGLE_SELECTION_MODE') {
          if (event.data.isSelectionMode) {
            enterSelectionMode();
          } else {
            exitSelectionMode();
          }
        }
      });
    })();
  `

  // Inject script when iframe loads
  const handleIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return

    try {
      const script = iframe.contentDocument?.createElement('script')
      if (script) {
        script.textContent = injectionScript
        iframe.contentDocument?.head.appendChild(script)
      }
    } catch (error) {
      console.warn('Could not inject script into iframe:', error)
    }
  }

  // Generate CSS selector
  const generateCSSPath = (element: { tagName: string; className?: string; id?: string }) => {
    if (element.id) return `#${element.id}`

    let path = element.tagName.toLowerCase()
    if (element.className) {
      const classes = element.className.split(' ').filter(Boolean)
      if (classes.length > 0) {
        path += '.' + classes.join('.')
      }
    }
    return path
  }

  // Generate XPath
  const generateXPath = (element: { tagName: string; className?: string; id?: string }) => {
    if (element.id) return `//*[@id="${element.id}"]`

    let path = `//${element.tagName.toLowerCase()}`
    if (element.className) {
      path += `[@class="${element.className}"]`
    }
    return path
  }

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'SELECTION_MODE_OFF') {
        setIsSelectionMode(false)
      } else if (event.data.type === 'ELEMENT_SELECTED') {
        const { elementData } = event.data
        setSelectedElementDetails({
          tag: elementData.tagName.toLowerCase(),
          id: elementData.id || undefined,
          className: elementData.className || undefined,
          name: elementData.name || undefined,
          text: elementData.textContent || undefined,
          cssPath: generateCSSPath(elementData),
          xpath: generateXPath(elementData),
          html: elementData.outerHTML,
        })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const toggleSelectionMode = () => {
    const newSelectionMode = !isSelectionMode
    setIsSelectionMode(newSelectionMode)

    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        {
          type: 'TOGGLE_SELECTION_MODE',
          isSelectionMode: newSelectionMode,
        },
        '*',
      )
    }
  }

  // Render property field with copy button
  const renderPropertyField = (id: string, label: string, value: string, bgColor?: string, borderColor?: string) => (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="flex">
        <Input
          id={id}
          value={value}
          readOnly
          className={`rounded-r-none border-r-0 font-mono text-sm ${bgColor || ''} ${borderColor || ''}`}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-10 w-10 rounded-l-none border-l-0 p-0"
              onClick={() => copyToClipboard(value)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copy {label.toLowerCase()}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="border-b bg-background shadow-sm">
          <div className="container mx-auto flex items-center justify-between px-6 py-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">Locator Explorer</h1>
              <p className="text-sm text-muted-foreground">Inspect and generate locators for test automation</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={toggleSelectionMode}
                variant={isSelectionMode ? 'default' : 'outline'}
                size="sm"
                className="flex items-center gap-2"
              >
                {isSelectionMode ? (
                  <>
                    <MousePointer className="h-4 w-4" />
                    Exit Selection
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4" />
                    Select Element
                  </>
                )}
              </Button>
              {isSelectionMode && (
                <Badge variant="secondary" className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></div>
                  Click an element to inspect
                </Badge>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex h-[calc(100vh-80px)]">
          {/* Left Column - Application Under Test */}
          <div className="flex-1 p-6">
            <Card className="h-full shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800">Application Under Test</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[80vh] overflow-hidden rounded-b-lg bg-gray-100">
                  <iframe
                    ref={iframeRef}
                    src={iframeUrl}
                    className="h-full w-full border-0"
                    title="Application Under Test"
                    sandbox="allow-same-origin allow-scripts allow-forms"
                    onLoad={handleIframeLoad}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Inspector Sidebar */}
          <div className="w-96 p-6 pl-0">
            <Card className="h-full shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <span className="truncate">Selected Element</span>
                  {selectedElementDetails && (
                    <Badge variant="outline" className="shrink-0 font-mono text-xs">
                      {selectedElementDetails.tag.toUpperCase()}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(80vh-60px)] p-6">
                  {selectedElementDetails ? (
                    <div className="space-y-6">
                      {/* Element Properties */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                          Properties
                        </h3>
                        <div className="space-y-3">
                          {renderPropertyField(
                            'tag',
                            'Tag Name',
                            selectedElementDetails.tag,
                            'bg-blue-50',
                            'border-blue-200',
                          )}
                          {selectedElementDetails.id && renderPropertyField('id', 'ID', selectedElementDetails.id)}
                          {selectedElementDetails.className &&
                            renderPropertyField('class', 'Class', selectedElementDetails.className)}
                          {selectedElementDetails.name &&
                            renderPropertyField('name', 'Name', selectedElementDetails.name)}
                          {selectedElementDetails.text &&
                            renderPropertyField('text', 'Text Content', selectedElementDetails.text)}
                        </div>
                      </div>

                      <Separator />

                      {/* Selectors */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Locators</h3>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="css" className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <span>CSS Selector</span>
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                Recommended
                              </Badge>
                            </Label>
                            <div className="flex">
                              <Input
                                id="css"
                                value={selectedElementDetails.cssPath}
                                readOnly
                                className="rounded-r-none border-r-0 border-green-200 bg-green-50 font-mono text-sm"
                              />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-10 w-10 rounded-l-none border-l-0 p-0"
                                    onClick={() => copyToClipboard(selectedElementDetails.cssPath)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Copy CSS selector</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          {renderPropertyField(
                            'xpath',
                            'XPath',
                            selectedElementDetails.xpath,
                            'bg-yellow-50',
                            'border-yellow-200',
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* HTML Snippet */}
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">HTML Snippet</Label>
                        <div className="flex">
                          <Textarea
                            value={selectedElementDetails.html}
                            readOnly
                            className="min-h-[120px] flex-1 resize-none rounded-r-none border-r-0 font-mono text-xs"
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-10 self-start rounded-l-none border-l-0"
                                style={{ height: '120px' }}
                                onClick={() => copyToClipboard(selectedElementDetails.html)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Copy HTML</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Target className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h3 className="mb-2 text-lg font-semibold">No Element Selected</h3>
                      <p className="mb-4 max-w-sm break-words text-sm text-muted-foreground">
                        Click the &quot;Select Element&quot; button above, then click on any element in the application
                        to inspect its properties.
                      </p>
                      <Alert className="max-w-sm">
                        <Info className="h-4 w-4" />
                        <AlertDescription className="break-words">
                          Use the element selector to generate reliable locators for your test automation scripts.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
