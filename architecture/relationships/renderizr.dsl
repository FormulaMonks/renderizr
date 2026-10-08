# Command-Line Interface
CliCommandLine -> CliBuildConfig "Builds the site with"
CliCommandLine -> CliEditServer "Starts"
CliBuildConfig -> CliAssetLoader "Loads the workspace with"
CliBuildConfig -> Site "Builds" "Vite"
CliEditServer -> CliBuildConfig "Configures Vite with"
CliEditServer -> CliEditPlugin "Serves the site with"
CliEditServer -> CliDslPipeline "Runs once before the server starts"
CliEditPlugin -> CliAssetLoader "Loads workspace.json with"
CliEditPlugin -> CliWorkspaceWriter "Writes saves through"
CliDslPipeline -> CliWorkspaceWriter "Writes each good run through"
CliDslPipeline -> CliEditPlugin "Sends flush, workspace and error events through"

# Static Site
SitePages -> SiteModel "Reads the workspace through"
SitePages -> SiteEngine "Mounts and drives"
SitePages -> SiteDocuments "Renders documents with"
SiteEngine -> SiteModel "Resolves views with"
SiteEngine -> SiteGeometry "Lays out and routes with"
SiteEngine -> SiteEditSession "Reports each layout change to"
SiteEditToolbar -> SiteEngine "Runs arrange and canvas commands on"
SiteEditToolbar -> SiteEditSession "Saves, undoes and redoes with"
SiteLiveReload -> SitePages "Swaps arriving workspaces in on"
SiteLiveReload -> SiteEditSession "Lays held edits over arriving workspaces with"

# Edit mode, between the two
SiteEditSession -> CliEditPlugin "Saves layouts to" "HTTP POST, session token"
CliEditPlugin -> SiteLiveReload "Sends workspace, error and flush events to" "Vite WebSocket"
