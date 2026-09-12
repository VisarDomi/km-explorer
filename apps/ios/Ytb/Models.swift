import Foundation

struct ViewPosition: Codable, Sendable {
    let path: String
    let y: Double
    static func route(_ path: String) -> String? {
        guard let url = URLComponents(string: path), url.scheme == nil, url.host == nil,
              url.fragment == nil, url.query == nil, path.count < 2048 else { return nil }
        if path == "/" { return "library:/" }
        if path.range(of: "^/(page/[2-9][0-9]*|page/1[0-9]+|actor/[^/]+)/?$", options: .regularExpression) != nil { return "library:" + path }
        if path.range(of: "^/[^/]+/?$", options: .regularExpression) != nil { return "video:" + path }
        return nil
    }
    func validate() throws {
        guard Self.route(path) != nil, y.isFinite, (0...1_000_000_000).contains(y) else { throw ReaderError.invalidRequest }
    }
}
struct ViewState: Codable, Sendable {
    var lastPath = "/"
    var libraryPath = "/"
    var positions: [String: ViewPosition] = [:]
}
enum ReaderError: LocalizedError {
    case invalidRequest
    var errorDescription: String? { "Invalid Ytb request" }
}
