import Foundation

// WebKit owns video streaming; this actor handles metadata and checkpoints only.
actor YtbStore {
    let root: URL
    let api: YtbAPI
    private var state = ViewState()
    init(root: URL, api: YtbAPI) { self.root = root; self.api = api }
    func load() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: root.appendingPathComponent("view.json")) {
            state = try JSONDecoder().decode(ViewState.self, from: data)
        }
    }
    func viewState() -> ViewState { state }
    func saveViewPosition(_ data: Data) throws {
        let position = try JSONDecoder().decode(ViewPosition.self, from: data)
        try position.validate()
        guard let key = ViewPosition.route(position.path) else { return }
        state.positions[key] = position; state.lastPath = position.path
        if key.hasPrefix("library:") { state.libraryPath = position.path }
        try JSONEncoder().encode(state).write(to: root.appendingPathComponent("view.json"), options: .atomic)
    }
    func fetch(_ input: Data) async throws -> String {
        let (data,response) = try await api.request(input)
        let headers = response.allHeaderFields.reduce(into: [String:String]()) { if let key = $1.key as? String { $0[key] = String(describing: $1.value) } }
        return String(decoding: try JSONEncoder().encode(HTTPResult(status: response.statusCode, headers: headers, body: data.base64EncodedString())), as: UTF8.self)
    }
    func localResource(_ url: URL) throws -> (data: Data, mime: String) {
        guard url.host == "app" else { throw ReaderError.invalidRequest }
        let assets = ["/app.js": "text/javascript", "/style.css": "text/css"]
        let name: String
        if assets[url.path] != nil { name = String(url.path.dropFirst()) }
        else { guard ViewPosition.route(url.path) != nil else { throw ReaderError.invalidRequest }; name = "index.html" }
        guard let file = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "Web") else { throw ReaderError.invalidRequest }
        return (try Data(contentsOf: file), assets[url.path] ?? "text/html")
    }
}
