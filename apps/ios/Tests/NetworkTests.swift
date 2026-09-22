import Foundation
final class NetworkFixture: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var attempts: [String:Int] = [:]
    static let lock = NSLock()
    static func count(_ key: String) -> Int { lock.lock(); defer { lock.unlock() }; return attempts[key, default:0] }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url=request.url!, key=url.host!+url.path
        Self.lock.lock(); Self.attempts[key, default:0] += 1; let n=Self.attempts[key]!; Self.lock.unlock()
        if url.path == "/recover" || url.path == "/image" || url.path == "/multi_search" {
            if n == 1 { client?.urlProtocol(self,didFailWithError:URLError(.networkConnectionLost)); return }
            let response=HTTPURLResponse(url:url,statusCode:n == 2 ? 503 : 200,httpVersion:nil,headerFields:["Content-Type":"image/png","Retry-After":"0"])!
            client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed)
            client?.urlProtocol(self,didLoad:Data([1,2,3,4])); client?.urlProtocolDidFinishLoading(self)
        } else { client?.urlProtocol(self,didFailWithError:URLError(.notConnectedToInternet)) }
    }
    override func stopLoading() {}
}
func check(_ condition: Bool, _ reason: String) throws { if !condition { throw NSError(domain:reason,code:1) } }
@main struct NetworkTests {
    static func main() async throws {
        let config=URLSessionConfiguration.ephemeral; config.protocolClasses=[NetworkFixture.self]
        let api = YtbAPI(origin:"https://fixture.invalid",pc:URL(string:"https://pc.invalid")!,certificateURL:nil,configuration:config)
        func input(_ host:String="fixture.invalid",_ path:String,_ method:String="GET") throws -> Data {
            try JSONSerialization.data(withJSONObject:["url":"https://"+host+path,"method":method])
        }
        let (bytes,response) = try await api.request(input("fixture.invalid","/recover"))
        try check(bytes == Data([1,2,3,4]) && response.statusCode == 200,"Read recovers network loss and 503")
        try check(NetworkFixture.count("fixture.invalid/recover") == 3,"Three HTTP attempts")
        for (host,path,method) in [("pc.invalid","/optional","GET"),("fixture.invalid","/write","POST")] {
            do { _ = try await api.request(input(host,path,method)); try check(false,"Should fail") } catch is URLError { }
            try check(NetworkFixture.count(host+path) == 1,"PC/write requests never loop")
        }
        let task=Task { try await api.request(input("fixture.invalid","/cancel")) }
        try await Task.sleep(for:.milliseconds(40)); task.cancel()
        do { _ = try await task.value; try check(false,"Cancellation should stop retry") } catch is CancellationError {} catch let error as URLError { try check(error.code == .cancelled,"Canceled transport") }
        _ = try await api.request(input("ts-api.ytboob.com","/multi_search","POST"))
        try check(NetworkFixture.count("ts-api.ytboob.com/multi_search") == 3,"Read-only search POST retries")
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at:root) }
        let store=YtbStore(root:root,api:api); try await store.load()
        try await store.saveViewPosition(JSONSerialization.data(withJSONObject:["path":"/actor/example/","y":400]))
        try await store.saveViewPosition(JSONSerialization.data(withJSONObject:["path":"/video-one/","y":200]))
        let reopened=YtbStore(root:root,api:api); try await reopened.load()
        let state=await reopened.viewState()
        try check(state.lastPath == "/video-one/" && state.libraryPath == "/actor/example/" && state.positions["video:/video-one/"]?.y == 200,"Reader and underlying list survive store recreation")
        print("PASS: search POST recovery and durable reader/list checkpoints")
        print("PASS: actual URLSession loss/503 recovery, cancellation, prompt PC and no write replay")
    }
}
