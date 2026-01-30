import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { 
  Square, 
  Pentagon, 
  Wand2, 
  Zap, 
  Users, 
  Download, 
  ArrowRight,
  CheckCircle2,
  MousePointer2,
  Layers
} from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-24 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="text-sm text-primary font-medium">AI-Powered Annotation</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-primary">Auto</span>matic
            <br />
            <span className="text-foreground">Object Detection</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            AutoOD is a powerful annotation platform for computer vision and machine learning. 
            Create training datasets faster with AI-assisted labeling and intuitive tools.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth?mode=signup">
              <Button size="lg" className="gap-2 text-lg px-8">
                Start Annotating Free
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="lg" className="text-lg px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 bg-card/30">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything You Need for Annotation
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Professional-grade tools designed for speed and accuracy in data labeling workflows.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Square className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Bounding Boxes</h3>
              <p className="text-muted-foreground text-sm">
                Draw precise rectangular annotations for object detection tasks with pixel-perfect accuracy.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Pentagon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Polygon Annotation</h3>
              <p className="text-muted-foreground text-sm">
                Create complex polygon shapes for segmentation and precise boundary marking.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">AI Auto-Annotation</h3>
              <p className="text-muted-foreground text-sm">
                Let AI detect and annotate objects automatically. Just review and refine for 10x faster labeling.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Keyboard Shortcuts</h3>
              <p className="text-muted-foreground text-sm">
                Speed up your workflow with intuitive shortcuts. Switch tools, undo, zoom—all at your fingertips.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Layers className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Label Management</h3>
              <p className="text-muted-foreground text-sm">
                Organize annotations with custom labels, colors, and categories for any project type.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Download className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Export Formats</h3>
              <p className="text-muted-foreground text-sm">
                Export annotations in COCO, YOLO, and other popular formats for direct model training.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold mb-6">
                AI-Powered
                <br />
                <span className="text-primary">Auto-Annotation</span>
              </h2>
              <p className="text-muted-foreground mb-8 text-lg">
                Stop spending hours manually labeling. AutoOD uses advanced vision models to 
                automatically detect objects in your images. Just create a few example 
                annotations, and let AI do the rest.
              </p>
              
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span>Multiple AI models: M873.1, M873.2 – M873.10</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span>Learn from your existing annotations</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span>10x faster dataset creation</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span>Review and refine AI suggestions</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-card border border-border rounded-2xl p-8">
              <div className="aspect-video bg-canvas-bg rounded-lg flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 canvas-pattern opacity-30" />
                <div className="relative z-10 text-center">
                  <MousePointer2 className="h-16 w-16 text-primary mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">Interactive annotation canvas</p>
                </div>
                {/* Mock annotations */}
                <div className="absolute top-1/4 left-1/4 w-20 h-16 border-2 border-annotation-blue rounded bg-annotation-blue/20" />
                <div className="absolute top-1/2 right-1/4 w-16 h-12 border-2 border-annotation-green rounded bg-annotation-green/20" />
                <div className="absolute bottom-1/4 left-1/3 w-24 h-14 border-2 border-annotation-orange rounded bg-annotation-orange/20" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary/5 border-y border-primary/20">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Accelerate Your Annotations?
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Join teams using AutoOD to build training datasets faster than ever.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" className="gap-2 text-lg px-10">
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg text-primary">
              AUTO<span className="text-foreground">OD</span>
            </span>
            <span className="text-muted-foreground text-sm">© 2024</span>
          </div>
          <p className="text-muted-foreground text-sm">
            AI-Powered Data Annotation Platform
          </p>
          <p className="text-muted-foreground text-sm font-medium">
            Powered by M873
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
