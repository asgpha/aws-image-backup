var program = require('commander');
var moment = require('moment');
var AWS = require('aws-sdk');
var sleep = require('sleep');
var _ = require('lodash');

program
    .version('0.1')
    .option('-i, --instances [value]', 'Comma seperate list of instances')
    .option('-d, --days [value]', 'Retention days')
    .option('-r --region [value]', 'AWS Region', 'us-east-1')
    .option('--noreboot', 'No reboot on create image')
    .parse(process.argv);

var todayString = moment().format('YYYYMMDD')
var deleteDateString = moment().subtract(parseInt(program.days), 'days').format('YYYYMMDD');
var instances = program.instances.split(',').map(function (t) { return t.trim(); });


AWS.config.update({region: program.region});


var ec2 = new AWS.EC2();

for (i = 0; i < instances.length; i++) { 
    ec2.describeInstances({
        InstanceIds: [
            instances[i],
        ]
    }, function (err, data) {
        var description;
        var instanceId;

        if (data.Reservations && data.Reservations.length > 0) {
            if (data.Reservations[0].Instances.length > 0) {
                var tags = data.Reservations[0].Instances[0].Tags;
                var nameTag =  _.find(tags, {Key: 'Name'});

                description = JSON.stringify(nameTag);
                instanceId = data.Reservations[0].Instances[0].InstanceId;
            }
            else {
                console.log(instanceId + ' doesn\'t exist');
                process.exit(1);
            }
        }
        else {
            console.log(instanceId + ' doesn\'t exist');
            process.exit(1);
        }

        if (err) {
            console.log(err, err.stack);
            process.exit(1);
        }
        else {
            ec2.createImage({
                InstanceId: instanceId,
                Name: todayString + '_' + instanceId,
                NoReboot: program.noreboot,
                Description: description
            }, function (err, data) {
                if (err) {
                    console.log(err, err.stack);
                    process.exit(1);
                }
                else {
                    console.log(data.ImageId.toString() + ' created from ' + instanceId);

                    console.log('working on deleting old ami images (' + deleteDateString + '_' + instanceId + ')')

                    ec2.describeImages({
                        Filters: [
                            {
                                Name: 'name',
                                Values: [
                                    deleteDateString + '_' + instanceId
                                ]
                            }
                        ]
                    }, function (err, data) {
                        if (err) {
                            console.log(err, err.stack);
                            process.exit(1);
                        }
                        else {
                            var images = data.Images;

                            for(im = 0; im < images.length; im++) {
                                var imageId = images[im].ImageId;

                                console.log('deleting ami-' + imageId);

                                ec2.deregisterImage({
                                    ImageId: imageId
                                }, function (err, data) {
                                    if (err) {
                                        console.log(err, err.stack);
                                        process.exit(1);
                                    }
                                    else {
                                        console.log(deleteDateString + '_' + instanceId + ' has been deregistered');
                                        console.log('working on deleting old snapshots (' + imageId + ')');

                                        ec2.describeSnapshots({
                                            Filters: [
                                                {
                                                    Name: 'description',
                                                    Values: [
                                                        'Created by CreateImage(' + instanceId + ') for ' + imageId + '*'
                                                    ]
                                                }
                                            ]
                                        }, function (err, data) {
                                            if (err) {
                                                console.log(err, err.stack);
                                                process.exit(1);
                                            }
                                            else {
                                                var snapshots = data.Snapshots;

                                                for (s = 0; s < snapshots.length; s++) {
                                                    var snapshot = snapshots[s];

                                                    ec2.deleteSnapshot({
                                                        SnapshotId: snapshot.SnapshotId
                                                    }, function (err, data) {
                                                        if (err) {
                                                            console.log(err, err.stack);
                                                            process.exit(1);
                                                        }
                                                        else {
                                                            console.log(snapshot.SnapshotId + ' has been deleted');
                                                        }
                                                    })
                                                }
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    });
                }
            });
        }
    });
}
