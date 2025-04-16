module.exports = {
    apps: [
        {
            name: 'print_server_desktop',
            script: 'bin/www.js',
            instances: 1,
            exec_mode: "cluster",
            node_args: '--harmony'
        }
    ]
}