import Foundation

struct ViewPosition: Codable, Sendable {
    let path: String
    let y: Double
    static func route(_ path: String) -> String? {
        guard let url = URLComponents(string: path), url.scheme == nil, url.host == nil,
              url.fragment == nil, path.count < 2048 else { return nil }
        let route = url.percentEncodedPath
        if route == "/" { return "library:" + path }
        if route == "/favs" || route == "/favs/" { return nil }
        if route.range(of: "^/page/[0-9]+/?$", options: .regularExpression) != nil {
            let number = route.split(separator: "/").last.flatMap { Int($0) }
            return number.map { $0 >= 2 } == true ? "library:" + path : nil
        }
        if route.range(of: "^/actor/[^/]+/?$", options: .regularExpression) != nil { return "library:" + path }
        if route.range(of: "^/[^/]+/?$", options: .regularExpression) != nil { return "video:" + path }
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
